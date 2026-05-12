# BMR Audit System

A pharmaceutical Batch Manufacturing Record (BMR) audit application powered by Mistral OCR + Gemini with zero-trust validation, now backed by MongoDB and JWT auth.

## Features

- High-fidelity OCR extraction and AI-driven audit verification
- Per-page analysis with streaming markdown preview
- Mathematical validation with local Python math engine
- MongoDB persistence for users, documents, pages, and reports
- Role-based auth: **Admin** and **Auditor**

## Roles

1. **Admin**
   - Default credentials: `admin` / `admin123`
   - Can create auditor users
2. **Auditor**
   - Can login, upload BMR PDFs, and run/track audits

## Data Models and Relations

- **Admin**: system administrator account.
- **Auditor**: employee account with employee details and audited document IDs.
- **Document**: uploaded PDF; groups page IDs and one report ID.
- **Page**: per-page metadata (`status`, `numeric_calc`, `signatures`, `dates`, `information`, `summary_text`, `auditor_id`).
- **Report**: document summary (`total_passed`, `total_failed`, `pipeline_validation`, `document_id`).

Relations:
- Auditor `1..*` Document
- Document `1..*` Page
- Document `1..1` Report
- Page `*..1` Auditor

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure backend/.env
# Required values:
# MONGO_URI=mongodb://127.0.0.1:27017
# MONGO_DB_NAME=drug_audit
# JWT_SECRET_KEY=change-me-in-production
# DEFAULT_ADMIN_USERNAME=admin
# DEFAULT_ADMIN_PASSWORD=admin123
# GEMINI_API_KEY=your_api_key_here
# MISTRAL_API_KEY=your_mistral_api_key_here

# Run the server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### 3. Access the App

Open `http://localhost:5173` and login.

## Auth API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/auth/login` | POST | Login with username/password and get JWT token |
| `/api/auth/me` | GET | Get current authenticated user profile |
| `/api/admin/users` | POST | Admin-only: create auditor user |

## Audit API

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/upload` | POST | Upload PDF and create document/job |
| `/api/audit/{job_id}` | WS | Stream audit output (`?token=<JWT>`) |
| `/api/status/{job_id}` | GET | Get persisted document/report status |
| `/api/job/{job_id}` | DELETE | Delete job, pages, report, and file |

All protected routes require `Authorization: Bearer <token>`.

## Requirements

### Backend

- Python 3.10+
- MongoDB
- FastAPI
- google-genai

### Frontend

- Node.js 18+
- React 18
- TailwindCSS

## License

Proprietary - Pharmaceutical Quality Assurance Tool
