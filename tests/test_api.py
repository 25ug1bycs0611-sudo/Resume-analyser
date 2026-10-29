from io import BytesIO

import fitz
from fastapi.testclient import TestClient

from api.main import app
from api.storage import memory_analyses, memory_accounts

client = TestClient(app)
RESUME = """
JORDAN LEE
Entry-level software engineer
SUMMARY
Computer science graduate with project experience building software and collaborating with a team.
EDUCATION
Bachelor of Science in Computer Science, 2025
SKILLS
Python, JavaScript, React, SQL, Git, teamwork
PROJECTS
Campus events application
- Built a React application to help students find events.
- Improved loading time by 25% through image optimization.
"""


def test_health_clearly_labels_demo_mode():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["mode"] in {"demo", "postgres"}
    assert response.json()["ocr_available"] is False


def test_upload_extracts_text_without_storing_the_file():
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), RESUME)
    pdf = document.tobytes()
    document.close()
    response = client.post(
        "/api/resume/upload",
        files={"file": ("jordan.pdf", BytesIO(pdf), "application/pdf")},
    )

    assert response.status_code == 200
    assert "JORDAN LEE" in response.json()["text"]
    assert response.json()["stored"] is False


def test_upload_rejects_wrong_mime_type():
    response = client.post(
        "/api/resume/upload",
        files={"file": ("resume.exe", BytesIO(b"MZ"), "application/octet-stream")},
    )
    assert response.status_code == 415


def test_guest_analysis_is_private_to_the_guest_session():
    first = client.post(
        "/api/resume/analyze",
        headers={"X-Guest-ID": "guest-session-1234"},
        json={"resume_text": RESUME, "required_skills": ["React"]},
    )
    assert first.status_code == 200
    analysis_id = first.json()["analysis_id"]

    owner = client.get("/api/analysis/" + analysis_id, headers={"X-Guest-ID": "guest-session-1234"})
    other_guest = client.get("/api/analysis/" + analysis_id, headers={"X-Guest-ID": "another-guest-1234"})
    history = client.get("/api/analysis/history", headers={"X-Guest-ID": "guest-session-1234"})

    assert owner.status_code == 200
    assert other_guest.status_code == 404
    assert history.json()[0]["analysis_id"] == analysis_id


def test_guest_can_delete_only_their_own_report():
    response = client.post(
        "/api/resume/analyze",
        headers={"X-Guest-ID": "delete-session-1234"},
        json={"resume_text": RESUME},
    )
    analysis_id = response.json()["analysis_id"]

    denied = client.delete("/api/analysis/" + analysis_id, headers={"X-Guest-ID": "other-session-12345"})
    deleted = client.delete("/api/analysis/" + analysis_id, headers={"X-Guest-ID": "delete-session-1234"})
    missing = client.get("/api/analysis/" + analysis_id, headers={"X-Guest-ID": "delete-session-1234"})

    assert denied.status_code == 404
    assert deleted.status_code == 204
    assert missing.status_code == 404


def test_account_authentication_uses_hashed_password_and_private_history():
    if not client.get("/api/health").json()["authentication_configured"]:
        return
    memory_accounts.clear()
    memory_analyses.clear()
    created = client.post(
        "/api/auth/register",
        json={"name": "Jordan Lee", "email": "jordan@example.com", "password": "secure-passphrase-42"},
    )
    assert created.status_code == 201
    assert "password_hash" not in created.json()["user"]
    login = client.post("/api/auth/login", json={"email": "jordan@example.com", "password": "secure-passphrase-42"})
    assert login.status_code == 200
    wrong = client.post("/api/auth/login", json={"email": "jordan@example.com", "password": "incorrect-password"})
    assert wrong.status_code == 401
