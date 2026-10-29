# ResumeAI — Smart Resume Analyzer

A standalone React + TypeScript career-assistance app with a FastAPI service, private PDF/DOCX parsing, explainable resume checks, job matching, optional account history, and an opt-in AI provider.

> **This is a career-writing aid, not a hiring tool.** Demo scores are deterministic text-check estimates, not official ATS scores, hiring decisions, or predictions of job-search success. Never add experience, skills, or qualifications that are not true.

## Run locally

Requirements: Node.js 20+ and Python 3.11+.

From this `ResumeAI` directory:

1. Install frontend packages: `npm install`
2. Create and activate a Python environment, then install the API dependencies:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements.txt
   ```

3. Optional: copy `.env.example` to `.env`. A unique 32+ character `JWT_SECRET` enables private accounts. Leave `DATABASE_URL` and `OPENAI_API_KEY` blank to use clearly labeled in-memory demo mode.
4. Start the API: `python -m uvicorn api.main:app --reload --port 8000`
5. In another terminal, start the website: `npm run dev`
6. Open the Vite URL (usually `http://localhost:5173`). Health details are at `http://localhost:8000/api/health`.

The browser can still run local, deterministic text-check analysis if the API is off. PDF/DOCX extraction, server-backed history, and accounts require the API. Uploaded files are processed in memory; no upload directory is created.

## Enable account history and PostgreSQL

Create a PostgreSQL database, set `.env`, and restart the API:

```dotenv
DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/resumeai
JWT_SECRET=use-a-unique-random-secret-with-at-least-32-characters
CLIENT_ORIGIN=http://localhost:5173
```

SQLAlchemy creates the `accounts` and `analyses` tables when the API starts. PostgreSQL is optional for local exploration; `sqlite:///./resumeai.db` is also supported for private local testing. Use managed secrets and a dedicated, least-privilege database account in deployment.

To turn on AI-assisted suggestions, optionally configure an OpenAI-compatible chat-completions provider:

```dotenv
OPENAI_API_KEY=your-provider-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

The client always requires a separate, unchecked-by-default AI-sharing consent. Only resume text is sent; email addresses and telephone numbers are removed first. Read the chosen provider’s retention policy before using this feature. A configured provider failure is shown as an error; it does not silently pretend to have generated AI feedback.

## Privacy and demo behavior

- **Guest analysis** uses a random browser guest ID. Recent guest reports stay in this browser session; the in-memory API loses its history when the process restarts.
- **Accounts** use Argon2id password hashing and expiring signed tokens. Provide `JWT_SECRET` to enable registration and login. Passwords must be at least 12 characters.
- **Saved reports** include the analysis result. The resume text is omitted unless you explicitly select “Save my resume text with this report.” Delete reports from the dashboard at any time.
- **File uploads** are size-limited, type-checked, read from memory, and immediately discarded after parsing. PDF OCR is not configured; scanned image-only PDFs produce an actionable error.
- **Demo analysis** is a deterministic rules-based checklist, not a language model. Add a provider key and separately opt in to get AI-assisted content feedback. AI output is schema-validated before display.
- Analysis history belongs to its owner. Career counselors and recruiters are not given access to private reports; candidate sharing or automated candidate ranking is not implemented.

Before public deployment, configure HTTPS, trusted CORS origins, database backups and retention, observability, production rate limits, and a reviewed privacy notice. Restrict access to uploaded resume information and follow applicable privacy and employment laws.

## Features

- Upload PDF or DOCX, paste resume text, or build a resume with repeatable education, experience, project, and certification sections.
- Set a target role, experience level, industry, job description, required skills, preferred location, career path, feedback tone, and output language.
- Review a transparent quality estimate, job-specific skill matches, ATS text-readability signals, strengths, gaps, practical priorities, and truthful rewrite examples.
- Explore predefined sample resumes and sample job descriptions.
- Search/delete analysis history; download a plain-text report; copy suggestions; switch light/dark theme.
- Browse anonymously or create an optional personal account for cross-session report history.
- Respect reduced-motion preferences and accessible form labels.

## API

- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `POST /api/resume/upload`
- `POST /api/resume/analyze`, `POST /api/resume/manual`
- `POST /api/jobs/match`
- `GET /api/analysis/{analysis_id}`, `GET /api/analysis/history`, `DELETE /api/analysis/{analysis_id}`

Requests that create/read/delete guest reports need an `X-Guest-ID` browser-session header. Signed-in requests use `Authorization: Bearer <token>`. Uploads are limited to PDF/DOCX and the configurable `MAX_UPLOAD_MB` size (8 MB by default).

## Tests and build

```powershell
python -m pytest
npm run build
```

The API tests cover deterministic scoring, input validation, document parsing, history ownership, report deletion, and optional account authentication.
