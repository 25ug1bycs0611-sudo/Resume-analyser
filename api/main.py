from __future__ import annotations

import io
import os
import re
import time
import uuid
from collections import defaultdict, deque
from pathlib import Path
from zipfile import BadZipFile

import fitz
from docx import Document
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from pydantic import ValidationError

APP_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(APP_ROOT / ".env")

from api.engine import analyze, analyze_with_ai
from api.schemas import (
    AnalysisRequest,
    AuthResponse,
    HistoryItem,
    LoginRequest,
    ManualAnalyzeRequest,
    RegistrationRequest,
    ResumeAnalysis,
)
from api.storage import (
    authenticate_account,
    delete_analysis,
    get_analysis,
    issue_token,
    jwt_ready,
    list_analyses,
    mode,
    optional_account,
    owner_key,
    register_account,
    save_analysis,
)

MAX_UPLOAD_BYTES = max(1, int(os.getenv("MAX_UPLOAD_MB", "8"))) * 1024 * 1024
ALLOWED_ORIGINS = [item.strip() for item in os.getenv("CLIENT_ORIGIN", "http://localhost:5173").split(",") if item.strip()]
app = FastAPI(title="ResumeAI API", version="1.0.0", description="Privacy-aware resume parsing and explainable career feedback.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Guest-ID"],
)

request_history: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def apply_rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        bucket = f"{request.client.host if request.client else 'unknown'}:{request.url.path}"
        now = time.monotonic()
        recent = request_history[bucket]
        while recent and recent[0] < now - 60:
            recent.popleft()
        limit = 10 if request.url.path.endswith("/analyze") or request.url.path.endswith("/match") else 30
        if len(recent) >= limit:
            return JSONResponse(status_code=429, content={"detail": "Too many requests. Please wait a moment and try again."})
        recent.append(now)
    return await call_next(request)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "mode": mode(),
        "database_configured": mode() != "demo",
        "ai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "authentication_configured": jwt_ready,
        "ocr_available": False,
    }


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
async def register(body: RegistrationRequest):
    account = register_account(body.name, body.email, body.password)
    return {"token": issue_token(account), "user": account}


@app.post("/api/auth/login", response_model=AuthResponse)
async def login(body: LoginRequest):
    account = authenticate_account(body.email, body.password)
    return {"token": issue_token(account), "user": account}


@app.get("/api/auth/me")
async def me(account: dict[str, str] | None = Depends(optional_account)):
    if not account:
        raise HTTPException(status_code=401, detail="Sign in to view your account.")
    return account


@app.post("/api/resume/upload")
async def upload_resume(file: UploadFile = File(...)):
    name = Path(file.filename or "").name
    extension = Path(name).suffix.lower()
    content_type = file.content_type or ""
    allowed = {
        ".pdf": {"application/pdf", "application/octet-stream"},
        ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"},
    }
    if extension not in allowed or content_type not in allowed[extension]:
        raise HTTPException(status_code=415, detail="Choose a PDF or DOCX resume. Other file types are not supported.")
    chunks = bytearray()
    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"File is too large. The limit is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    raw = bytes(chunks)
    if not raw:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")
    try:
        if extension == ".pdf":
            if not raw.startswith(b"%PDF-"):
                raise HTTPException(status_code=422, detail="The PDF header is invalid or the file is corrupted.")
            with fitz.open(stream=raw, filetype="pdf") as document:
                if document.is_encrypted:
                    raise HTTPException(status_code=422, detail="This PDF is password-protected. Export an unlocked copy and try again.")
                if document.page_count > 80:
                    raise HTTPException(status_code=422, detail="This PDF has more than 80 pages. Upload a shorter resume.")
                text = "\n".join(page.get_text("text", sort=True) for page in document)
                page_count = document.page_count
            if not text.strip():
                raise HTTPException(status_code=422, detail="No selectable text was found. This may be a scanned PDF; OCR is not configured in this demo. Paste the resume text or enable a private OCR service.")
        else:
            if not raw.startswith(b"PK"):
                raise HTTPException(status_code=422, detail="The DOCX package is invalid or corrupted.")
            document = Document(io.BytesIO(raw))
            paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                    line = " | ".join(cell for cell in cells if cell)
                    if line:
                        paragraphs.append(line)
            text = "\n".join(paragraphs)
            page_count = None
    except HTTPException:
        raise
    except (fitz.FileDataError, BadZipFile, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail="This document could not be read. Check the file or paste the resume text instead.") from exc
    finally:
        await file.close()
    cleaned = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(cleaned) < 100:
        raise HTTPException(status_code=422, detail="The document contains too little readable text. Check the file or paste the resume text instead.")
    if len(cleaned) > 60_000:
        cleaned = cleaned[:60_000]
    return {
        "filename": name,
        "text": cleaned,
        "characters": len(cleaned),
        "page_count": page_count,
        "retention_minutes": max(1, int(os.getenv("UPLOAD_RETENTION_MINUTES", "15"))),
        "stored": False,
        "notice": "This document was parsed in memory and immediately discarded. Review and edit the extracted text before analysis.",
    }


async def _run_analysis(body: AnalysisRequest, owner: str) -> ResumeAnalysis:
    if body.consent_to_ai and os.getenv("OPENAI_API_KEY"):
        result = await analyze_with_ai(body)
    else:
        result = analyze(body)
    stored_payload = body.model_dump()
    if not body.consent_to_store:
        stored_payload["resume_text"] = ""
    save_analysis(owner, stored_payload, result.model_dump())
    return result


@app.post("/api/resume/analyze", response_model=ResumeAnalysis)
async def analyze_resume(body: AnalysisRequest, owner: str = Depends(owner_key)):
    return await _run_analysis(body, owner)


@app.post("/api/resume/manual", response_model=ResumeAnalysis)
async def analyze_manual(body: ManualAnalyzeRequest, owner: str = Depends(owner_key)):
    try:
        request = AnalysisRequest(
            resume_text=body.resume.as_text(),
            job_title=body.job_title,
            industry=body.industry,
            job_description=body.job_description,
            required_skills=body.required_skills,
            experience_level=body.experience_level,
            preferred_location=body.preferred_location,
            career_path=body.career_path,
            analysis_type=body.analysis_type,
            output_language=body.output_language,
            feedback_style=body.feedback_style,
            consent_to_ai=body.consent_to_ai,
            consent_to_store=body.consent_to_store,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc
    return await _run_analysis(request, owner)


@app.post("/api/jobs/match", response_model=ResumeAnalysis)
async def match_job(body: AnalysisRequest, owner: str = Depends(owner_key)):
    if not body.job_description.strip() and not body.required_skills and not body.job_title.strip():
        raise HTTPException(status_code=422, detail="Add a job title, job description, or required skills to run a job match.")
    request = body.model_copy(update={"analysis_type": "Job Matching"})
    return await _run_analysis(request, owner)


@app.get("/api/analysis/history", response_model=list[HistoryItem])
async def analysis_history(owner: str = Depends(owner_key)):
    history = []
    for saved in list_analyses(owner):
        result, payload = saved["result"], saved["payload"]
        history.append({
            "analysis_id": result["analysis_id"],
            "created_at": result["created_at"],
            "job_title": payload.get("job_title") or payload.get("career_path") or "General resume review",
            "analysis_type": payload.get("analysis_type", "General Resume Review"),
            "overall_score": result["scores"]["overall"],
            "job_match_score": result.get("job_match_score"),
        })
    return history


@app.get("/api/analysis/{analysis_id}", response_model=ResumeAnalysis)
async def analysis_detail(analysis_id: str, owner: str = Depends(owner_key)):
    try:
        uuid.UUID(analysis_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="This analysis was not found in your account.") from exc
    return get_analysis(owner, analysis_id)["result"]


@app.delete("/api/analysis/{analysis_id}", status_code=204)
async def remove_analysis(analysis_id: str, owner: str = Depends(owner_key)):
    try:
        uuid.UUID(analysis_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="This analysis was not found in your account.") from exc
    delete_analysis(owner, analysis_id)
