# BMR Audit System

A pharmaceutical Batch Manufacturing Record (BMR) audit application powered by Mistral OCR + Gemini with Zero-Trust validation.

## Features

- **High-Fidelity OCR** - Extracts text exactly as written, distinguishing handwritten from printed entries
- **Signature Detection** - Identifies and validates all signature fields
- **Mathematical Validation** - Uses Calculation API (Python code execution) to verify all calculations
- **Cross-Page Consistency** - Validates batch numbers and totals across the entire document
- **Live Streaming** - Watch the audit results appear in real-time
- **Beautiful Markdown Preview** - Professional rendering of tables, code blocks, and status badges

## Architecture

```
drug/
├── backend/           # FastAPI + Mistral OCR + Gemini
│   ├── main.py        # API endpoints
│   ├── gemini_service.py  # Gemini integration (via Google GenAI SDK)
│   └── prompts.py     # Audit prompts
└── frontend/          # React + Vite + TailwindCSS
    └── src/
        ├── App.tsx
        └── components/
```

## Quick Start

### 1. Backend Setup

```bash
cd backend

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Required: Gemini API key
# PowerShell
$env:GEMINI_API_KEY="your_api_key_here"

# Required: Mistral API key (Document AI / OCR)
$env:MISTRAL_API_KEY="your_mistral_api_key_here"

# Note: This backend uses Google Gemini (audit + tool calling)
# and Mistral OCR (document text extraction).

# Optional runtime flags
$env:GEMINI_MODEL_ID="gemma-4-31b-it"
$env:ENABLE_CODE_EXECUTION="true"
$env:EMIT_CALCULATION_TRACE="false"
$env:MODEL_SERVER_RETRIES="6"
$env:MODEL_SERVER_REQUEST_TIMEOUT_SECONDS="0"   # 0 disables backend timeout
$env:OUTPUT_REPAIR_TIMEOUT_SECONDS="20"         # avoid hanging on post-format repair pass
$env:MODEL_SERVER_RETRY_BASE_SECONDS="3"
$env:MODEL_SERVER_RETRY_MAX_SECONDS="90"
$env:MODEL_SERVER_RETRY_OCR_CHARS="450000"
$env:MAX_UPLOAD_SIZE_MB="100"
$env:PDF_COMPRESSION_TRIGGER_MB="20"
$env:MAX_OUTPUT_TOKENS="24576"
# Generation setup is enforced in backend code:
# temperature=0.2, top_p=0.9, top_k=40
# media_resolution=MEDIA_RESOLUTION_HIGH (max visual token budget level)

# Run the server
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

### 3. Access the Application

Open http://localhost:5173 in your browser.

## Usage

1. **Upload** - Drag and drop your BMR PDF (up to 100MB, 70+ pages supported)
2. **Wait** - The system processes each page with mathematical validation
3. **Review** - View the live audit report with PASS/FAIL indicators

## Technical Details

### Gemini Configuration

- **SDK**: `google-genai`
- **Model**: `gemma-4-31b-it` (locked model)
- **API Key Source**: `GEMINI_API_KEY` or `GOOGLE_API_KEY` must be set in environment
- **Generation**: `temperature=0.2`, `top_p=0.9`, `top_k=40`
- **Thinking Trigger**: disabled (`<|think|>` is stripped from system instructions)
- **Media Resolution**: `MEDIA_RESOLUTION_HIGH` (max detail token budget level)
- **Input Payload**: System instruction + uploaded PDF + OCR output are sent together
- **Model Reliability Fallbacks**: transient Gemini 500/internal errors are retried with backoff and safer fallback payload/config
- **Features**: Code Execution enabled for math validation (`ENABLE_CODE_EXECUTION=true`)
- **Fallback**: If model/tool does not support code execution, audit continues with manual BODMAS output
- **Streaming Behavior**: Response parts are parsed directly (text + tool parts), so non-text part warnings are avoided

### Mistral OCR Configuration

- **Endpoint**: `https://api.mistral.ai/v1/ocr` (override with `MISTRAL_OCR_ENDPOINT`)
- **Model**: `mistral-ocr-latest` (override with `MISTRAL_OCR_MODEL`)
- **API Key Source**: `MISTRAL_API_KEY` (or `backend/local_mistral_api_key.txt`)
- **Pipeline**: Upload PDF → Mistral OCR extraction → Gemini receives prompt + visual PDF file + OCR text for validation and audit

### Validation Components

- Gross/Tare/Net weight calculations
- Cumulative totals vs theoretical quantities
- Batch number consistency
- Required signature fields
- Date field validation

## API Endpoints

| Endpoint               | Method | Description                     |
| ---------------------- | ------ | ------------------------------- |
| `/api/upload`          | POST   | Upload PDF, returns job_id      |
| `/api/audit/{job_id}`  | WS     | WebSocket for streaming results |
| `/api/status/{job_id}` | GET    | Check job status                |

## Requirements

### Backend

- Python 3.10+
- FastAPI
- google-genai

### Frontend

- Node.js 18+
- React 18
- TailwindCSS

## License

Proprietary - Pharmaceutical Quality Assurance Tool
