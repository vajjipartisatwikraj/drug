"""
BMR Audit System — FastAPI Application Entry Point with MongoDB persistence and JWT auth.
"""

import asyncio
import logging
import logging.handlers
import os
import re
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import aiofiles
import uvicorn as _uvicorn
from bson import ObjectId
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from starlette.websockets import WebSocketState

from auth import create_access_token, decode_access_token, hash_password, verify_password
from config import DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME
from db import get_db
from gemini_service import audit_service
from local_math_server import math_app
from math_api_service import math_api_service
from models import AdminModel, AuditorModel, DocumentModel, PageModel, ReportModel, UserRole

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
_LOG_DIR = Path(__file__).resolve().parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_LOG_FILE = _LOG_DIR / "audit.log"

_FMT = "%(asctime)s | %(levelname)-8s | %(name)-22s | %(message)s"
_DATE_FMT = "%Y-%m-%d %H:%M:%S"
_formatter = logging.Formatter(_FMT, datefmt=_DATE_FMT)

_console_handler = logging.StreamHandler(sys.stdout)
_console_handler.setFormatter(_formatter)
_console_handler.setLevel(logging.DEBUG)

_file_handler = logging.handlers.RotatingFileHandler(
    _LOG_FILE,
    maxBytes=10 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(_formatter)
_file_handler.setLevel(logging.DEBUG)

logging.basicConfig(level=logging.DEBUG, handlers=[_console_handler, _file_handler])
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn.error").setLevel(logging.INFO)
logging.getLogger("watchfiles").setLevel(logging.WARNING)

log = logging.getLogger("main")

# ─────────────────────────────────────────────────────────────────────────────
# App settings
# ─────────────────────────────────────────────────────────────────────────────
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))
UPLOAD_CHUNK_SIZE_BYTES = int(os.getenv("UPLOAD_CHUNK_SIZE_BYTES", str(1024 * 1024)))

_MATH_SERVER_PORT = int(os.getenv("MATH_SERVER_PORT", "8001"))
_math_server_thread: threading.Thread | None = None

security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    username: str
    password: str


class CreateAuditorRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    employee_details: dict[str, Any] = Field(default_factory=dict)


class PageStatusUpdateRequest(BaseModel):
    status: str


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_id(value: Any) -> str:
    if isinstance(value, ObjectId):
        return str(value)
    return str(value)


def _serialize_document(doc: dict[str, Any]) -> dict[str, Any]:
    out = dict(doc)
    out["id"] = _serialize_id(out.pop("_id"))
    out["auditor_id"] = _serialize_id(out.get("auditor_id", ""))
    out["page_ids"] = [_serialize_id(v) for v in out.get("page_ids", [])]
    if out.get("report_id"):
        out["report_id"] = _serialize_id(out["report_id"])
    if isinstance(out.get("created_at"), datetime):
        out["created_at"] = out["created_at"].isoformat()
    if isinstance(out.get("updated_at"), datetime):
        out["updated_at"] = out["updated_at"].isoformat()
    return out


def _parse_page_sections(markdown: str) -> list[tuple[int, str]]:
    lines = markdown.splitlines()
    matches: list[tuple[int, int]] = []
    pattern = re.compile(r"^\s*(?:#+\s*)?Page\s+(\d+)\b", re.IGNORECASE)
    for idx, line in enumerate(lines):
        m = pattern.match(line.strip())
        if m:
            matches.append((idx, int(m.group(1))))
    if not matches:
        return []

    sections: list[tuple[int, str]] = []
    for i, (start_idx, page_no) in enumerate(matches):
        end_idx = matches[i + 1][0] if i + 1 < len(matches) else len(lines)
        section_text = "\n".join(lines[start_idx:end_idx]).strip()
        sections.append((page_no, section_text))
    return sections


def _extract_page_status(section_text: str) -> str:
    m = re.search(r"Status\s*:\s*([A-Za-z/ -]+)", section_text, flags=re.IGNORECASE)
    if not m:
        return "unknown"
    status = m.group(1).strip().upper()
    if "PASS" in status:
        return "pass"
    if "FAIL" in status:
        return "fail"
    if "VOID" in status:
        return "void"
    return status.lower()


def _extract_signature_lines(section_text: str) -> list[str]:
    out = []
    for line in section_text.splitlines():
        if "signature" in line.lower():
            out.append(line.strip("- •\t"))
    return out


def _extract_dates(section_text: str) -> list[str]:
    date_pattern = re.compile(
        r"\b(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b"
    )
    return list(dict.fromkeys(date_pattern.findall(section_text)))


def _extract_numeric_lines(section_text: str) -> list[str]:
    out = []
    for line in section_text.splitlines():
        low = line.lower()
        if "numeric" in low or "calc" in low or "math" in low:
            out.append(line.strip("- •\t"))
    return out


def _extract_information(section_text: str) -> list[str]:
    return [line.strip("- •\t") for line in section_text.splitlines() if line.strip().startswith("-")]


def _extract_summary_text(markdown: str) -> str:
    summary_match = re.search(
        r"(?:#+\s*)?(FINAL\s+AUDIT\s+SUMMARY.*)$",
        markdown,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if summary_match:
        return summary_match.group(1).strip()
    if len(markdown) <= 2500:
        return markdown.strip()
    return markdown[-2500:].strip()


def _build_date_filter(year: int | None, month: int | None, day: int | None) -> dict[str, Any]:
    if year is None and month is None and day is None:
        return {}
    if year is None:
        raise HTTPException(status_code=400, detail="year is required when month/day filter is used")
    if month is not None and (month < 1 or month > 12):
        raise HTTPException(status_code=400, detail="month must be 1..12")
    if day is not None and (day < 1 or day > 31):
        raise HTTPException(status_code=400, detail="day must be 1..31")

    if day is not None and month is None:
        raise HTTPException(status_code=400, detail="month is required when day filter is used")

    try:
        start = datetime(year, month or 1, day or 1, tzinfo=timezone.utc)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid date filter: {exc}") from exc

    if day is not None:
        end = start + timedelta(days=1)
    elif month is not None:
        end = datetime(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    return {"$gte": start, "$lt": end}


async def _auth_from_token(token: str) -> dict[str, Any]:
    payload = decode_access_token(token)
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = await get_db().users.find_one({"username": username})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user["id"] = str(user["_id"])
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict[str, Any]:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authorization token required")
    return await _auth_from_token(credentials.credentials)


async def get_current_admin(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if current_user.get("role") != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def _authorize_document_access(document: dict[str, Any], user: dict[str, Any]) -> None:
    if user.get("role") == UserRole.ADMIN.value:
        return
    if str(document.get("auditor_id")) != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Access denied for this document")


def _run_local_math_server() -> None:
    log.info("Starting local math server on http://127.0.0.1:%d", _MATH_SERVER_PORT)
    _uvicorn.run(
        math_app,
        host="127.0.0.1",
        port=_MATH_SERVER_PORT,
        log_level="warning",
        access_log=False,
    )


async def _ensure_indexes_and_seed_admin() -> None:
    db = get_db()
    await db.users.create_index("username", unique=True)
    await db.documents.create_index([("auditor_id", 1), ("created_at", -1)])
    await db.pages.create_index([("document_id", 1), ("page_number", 1)])
    await db.reports.create_index("document_id", unique=True)

    existing = await db.users.find_one({"username": DEFAULT_ADMIN_USERNAME})
    if existing:
        return

    admin_model = AdminModel(
        username=DEFAULT_ADMIN_USERNAME,
        password_hash=hash_password(DEFAULT_ADMIN_PASSWORD),
    )
    await db.users.insert_one(admin_model.model_dump())
    log.info("Default admin user ensured: %s", DEFAULT_ADMIN_USERNAME)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _math_server_thread

    log.info("BMR AUDIT SYSTEM STARTING")
    await _ensure_indexes_and_seed_admin()

    _math_server_thread = threading.Thread(
        target=_run_local_math_server,
        daemon=True,
        name="LocalMathServer",
    )
    _math_server_thread.start()
    log.info("Local math server thread started (port=%d)", _MATH_SERVER_PORT)

    import httpx as _httpx

    health_url = f"http://127.0.0.1:{_MATH_SERVER_PORT}/math/health"
    ready = False
    for _ in range(15):
        await asyncio.sleep(0.35)
        try:
            async with _httpx.AsyncClient(timeout=1.5) as client:
                r = await client.get(health_url)
            if r.status_code == 200:
                ready = True
                break
        except Exception:
            continue
    if not ready:
        log.warning("Local math server did not become reachable in startup window")

    log.info("BMR AUDIT SYSTEM READY")
    yield
    log.info("BMR AUDIT SYSTEM SHUTDOWN")


app = FastAPI(
    title="BMR Audit System",
    description="Pharmaceutical BMR audit API with MongoDB and JWT authentication.",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    math_ok = (await math_api_service.test_connection())["working"]
    return {
        "status": "healthy",
        "service": "BMR Audit System",
        "ai_model": getattr(audit_service, "model_id", "unknown"),
        "ai_configured": audit_service.is_configured(),
        "math_server_ok": math_ok,
    }


@app.post("/api/auth/login")
async def login(payload: LoginRequest):
    user = await get_db().users.find_one({"username": payload.username})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(
        {"sub": user["username"], "role": user["role"], "uid": str(user["_id"])}
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "role": user["role"],
            "employee_details": user.get("employee_details", {}),
        },
    }


@app.get("/api/auth/me")
async def auth_me(current_user: dict[str, Any] = Depends(get_current_user)):
    return {
        "id": str(current_user["_id"]),
        "username": current_user["username"],
        "role": current_user["role"],
        "employee_details": current_user.get("employee_details", {}),
    }


@app.post("/api/admin/users")
async def create_auditor_user(
    payload: CreateAuditorRequest,
    _: dict[str, Any] = Depends(get_current_admin),
):
    if await get_db().users.find_one({"username": payload.username}):
        raise HTTPException(status_code=409, detail="Username already exists")

    model = AuditorModel(
        username=payload.username,
        employee_details=payload.employee_details,
        password_hash=hash_password(payload.password),
    )
    res = await get_db().users.insert_one(model.model_dump())
    return {
        "id": str(res.inserted_id),
        "username": payload.username,
        "role": UserRole.AUDITOR.value,
    }


@app.get("/api/test-math")
async def test_math(_: dict[str, Any] = Depends(get_current_user)):
    basic = await math_api_service.test_connection()
    return JSONResponse(basic)


@app.post("/api/math/calculate")
async def math_calculate(
    payload: dict,
    _: dict[str, Any] = Depends(get_current_user),
):
    operation = payload.get("operation")
    if not operation:
        raise HTTPException(status_code=400, detail="'operation' field is required.")
    kwargs = {k: v for k, v in payload.items() if k != "operation"}
    try:
        result = await math_api_service.calculate(operation, **kwargs)
        return JSONResponse({"status": "ok", "data": result})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if not audit_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "AI model not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY and "
                "MISTRAL_API_KEY, then restart backend."
            ),
        )

    filename = file.filename or "unnamed"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    document_id = ObjectId()
    file_path = UPLOAD_DIR / f"{document_id}.pdf"
    max_upload_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    total_bytes = 0

    try:
        async with aiofiles.open(file_path, "wb") as f:
            while True:
                chunk = await file.read(UPLOAD_CHUNK_SIZE_BYTES)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds {MAX_UPLOAD_SIZE_MB}MB upload limit.",
                    )
                await f.write(chunk)
    except HTTPException:
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    if total_bytes == 0:
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    size_mb = round(total_bytes / (1024 * 1024), 2)
    document_model = DocumentModel(
        filename=filename,
        file_path=str(file_path),
        size_mb=size_mb,
        auditor_id=str(current_user["_id"]),
        upload_ts=time.time(),
    )
    doc = document_model.model_dump()
    doc["_id"] = document_id
    doc["auditor_id"] = ObjectId(doc["auditor_id"])
    await get_db().documents.insert_one(doc)

    await get_db().users.update_one(
        {"_id": current_user["_id"]},
        {"$addToSet": {"audited_document_ids": str(document_id)}},
    )

    return JSONResponse(
        {
            "job_id": str(document_id),
            "filename": filename,
            "size_mb": size_mb,
            "message": "File uploaded. Connect to WebSocket to start audit.",
        }
    )


@app.websocket("/api/audit/{job_id}")
async def websocket_audit(websocket: WebSocket, job_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Missing token"})
        await websocket.close(code=1008)
        return

    try:
        user = await _auth_from_token(token)
    except Exception:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Invalid token"})
        await websocket.close(code=1008)
        return

    await websocket.accept()

    if not ObjectId.is_valid(job_id):
        await websocket.send_json({"type": "error", "message": "Invalid job id"})
        await websocket.close(code=1008)
        return

    document = await get_db().documents.find_one({"_id": ObjectId(job_id)})
    if not document:
        await websocket.send_json({"type": "error", "message": "Job not found"})
        await websocket.close()
        return

    try:
        await _authorize_document_access(document, user)
    except HTTPException:
        await websocket.send_json({"type": "error", "message": "Access denied"})
        await websocket.close(code=1008)
        return

    connection_active = True
    pipeline_events: list[dict[str, Any]] = []

    async def send_json_safe(payload: dict) -> bool:
        nonlocal connection_active
        if not connection_active:
            return False
        try:
            if websocket.client_state != WebSocketState.CONNECTED:
                connection_active = False
                return False
            await websocket.send_json(payload)
            return True
        except WebSocketDisconnect:
            connection_active = False
            return False
        except RuntimeError as exc:
            if "close message has been sent" in str(exc).lower():
                connection_active = False
                return False
            raise

    async def emit_pipeline(stage: str, message: str, meta: dict | None = None) -> None:
        event = {
            "stage": stage,
            "message": message,
            "meta": meta or {},
            "ts": _utc_now_iso(),
        }
        pipeline_events.append(event)
        await send_json_safe(
            {"type": "pipeline", "stage": stage, "message": message, "meta": meta or {}}
        )

    t_start = time.perf_counter()
    await get_db().documents.update_one(
        {"_id": document["_id"]},
        {"$set": {"status": "processing", "updated_at": _utc_now_iso()}},
    )

    try:
        if not await send_json_safe(
            {
                "type": "status",
                "status": "processing",
                "message": (
                    f"Audit started — {document['filename']} ({document['size_mb']} MB). "
                    "Local math engine ready."
                ),
            }
        ):
            return

        await emit_pipeline(
            "upload_received",
            "File uploaded and accepted by backend.",
            {
                "filename": document["filename"],
                "size_mb": document["size_mb"],
                "timer_start_ts": document.get("upload_ts", time.time()),
            },
        )

        chunk_count = 0
        chunks: list[str] = []
        async for chunk in audit_service.process_bmr(document["file_path"], status_cb=emit_pipeline):
            if not await send_json_safe({"type": "content", "markdown": chunk}):
                await get_db().documents.update_one(
                    {"_id": document["_id"]},
                    {"$set": {"status": "disconnected"}},
                )
                return
            chunks.append(chunk)
            chunk_count += 1

        markdown_result = "".join(chunks)
        page_sections = _parse_page_sections(markdown_result)
        page_ids: list[ObjectId] = []
        pass_count = 0
        fail_count = 0
        summary_text = _extract_summary_text(markdown_result)

        await get_db().pages.delete_many({"document_id": document["_id"]})
        for page_number, section_text in page_sections:
            page_status = _extract_page_status(section_text)
            if page_status == "pass":
                pass_count += 1
            elif page_status == "fail":
                fail_count += 1
            page_model = PageModel(
                document_id=str(document["_id"]),
                page_number=page_number,
                status=page_status,
                numeric_calc=_extract_numeric_lines(section_text),
                signatures=_extract_signature_lines(section_text),
                dates=_extract_dates(section_text),
                information=_extract_information(section_text),
                summary_text=section_text,
                auditor_id=str(document["auditor_id"]),
            )
            page_doc = page_model.model_dump()
            page_doc["document_id"] = ObjectId(page_doc["document_id"])
            page_doc["auditor_id"] = ObjectId(page_doc["auditor_id"])
            page_res = await get_db().pages.insert_one(page_doc)
            page_ids.append(page_res.inserted_id)

        await get_db().reports.delete_many({"document_id": document["_id"]})
        report_model = ReportModel(
            document_id=str(document["_id"]),
            total_passed=pass_count,
            total_failed=fail_count,
            summary_text=summary_text,
            pipeline_validation=pipeline_events,
        )
        report_doc = report_model.model_dump()
        report_doc["document_id"] = ObjectId(report_doc["document_id"])
        report_res = await get_db().reports.insert_one(report_doc)

        elapsed = time.perf_counter() - t_start
        await get_db().documents.update_one(
            {"_id": document["_id"]},
            {
                "$set": {
                    "status": "completed",
                    "result": markdown_result,
                    "page_ids": page_ids,
                    "report_id": report_res.inserted_id,
                    "updated_at": _utc_now_iso(),
                    "analyzed_at": datetime.now(timezone.utc),
                }
            },
        )

        await send_json_safe(
            {
                "type": "status",
                "status": "completed",
                "message": f"Audit complete in {elapsed:.1f} s — {chunk_count} output chunk(s).",
            }
        )
        await emit_pipeline(
            "audit_completed",
            "Audit pipeline completed.",
            {"elapsed_s": round(elapsed, 1), "chunks": chunk_count},
        )
    except WebSocketDisconnect:
        await get_db().documents.update_one(
            {"_id": document["_id"]},
            {"$set": {"status": "disconnected", "updated_at": _utc_now_iso()}},
        )
    except Exception as exc:
        await get_db().documents.update_one(
            {"_id": document["_id"]},
            {"$set": {"status": "error", "updated_at": _utc_now_iso()}},
        )
        log.exception("AUDIT ERROR job_id=%s error=%s", job_id, exc)
        await send_json_safe({"type": "error", "message": str(exc)})


@app.get("/api/status/{job_id}")
async def get_job_status(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    doc = await get_db().documents.find_one({"_id": ObjectId(job_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    await _authorize_document_access(doc, current_user)
    report = await get_db().reports.find_one({"document_id": doc["_id"]})
    serialized = _serialize_document(doc)
    if report:
        serialized["report"] = {
            "id": str(report["_id"]),
            "total_passed": report.get("total_passed", 0),
            "total_failed": report.get("total_failed", 0),
            "summary_text": report.get("summary_text", ""),
            "pipeline_validation": report.get("pipeline_validation", []),
        }
    return serialized


@app.get("/api/auditor/recent-documents")
async def get_recent_documents(
    limit: int = 10,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")

    query: dict[str, Any] = {"status": "completed"}
    if current_user.get("role") == UserRole.AUDITOR.value:
        query["auditor_id"] = current_user["_id"]

    docs = (
        await get_db()
        .documents.find(query)
        .sort("analyzed_at", -1)
        .limit(limit)
        .to_list(length=limit)
    )
    return {"documents": [_serialize_document(doc) for doc in docs]}


@app.get("/api/documents/{job_id}")
async def get_document_details(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=404, detail="Document not found")
    oid = ObjectId(job_id)
    doc = await get_db().documents.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await _authorize_document_access(doc, current_user)

    pages = await get_db().pages.find({"document_id": oid}).sort("page_number", 1).to_list(length=5000)
    report = await get_db().reports.find_one({"document_id": oid})

    # Count pass and fail pages
    pass_count = sum(1 for p in pages if p.get("status") in ["pass", "manual_pass"])
    fail_count = sum(1 for p in pages if p.get("status") in ["fail", "manual_fail"])
    
    serialized_doc = _serialize_document(doc)
    serialized_pages = []
    for page in pages:
        serialized_pages.append(
            {
                "id": str(page["_id"]),
                "document_id": str(page["document_id"]),
                "page_number": page.get("page_number"),
                "status": page.get("status"),
                "numeric_calc": page.get("numeric_calc", []),
                "signatures": page.get("signatures", []),
                "dates": page.get("dates", []),
                "information": page.get("information", []),
                "summary_text": page.get("summary_text", ""),
                "auditor_id": str(page.get("auditor_id")),
                "details": {
                    "numeric_calc": page.get("numeric_calc", []),
                    "signatures": page.get("signatures", []),
                    "dates": page.get("dates", []),
                    "information": page.get("information", []),
                    "summary": page.get("summary_text", ""),
                }
            }
        )

    serialized_report = None
    if report:
        serialized_report = {
            "id": str(report["_id"]),
            "document_id": str(report["document_id"]),
            "total_passed": report.get("total_passed", 0),
            "total_failed": report.get("total_failed", 0),
            "summary_text": report.get("summary_text", ""),
            "pipeline_validation": report.get("pipeline_validation", []),
            "created_at": report.get("created_at").isoformat()
            if isinstance(report.get("created_at"), datetime)
            else report.get("created_at"),
        }

    return {
        "document": {
            **serialized_doc,
            "pages": serialized_pages,
            "summary": {
                "pass_count": pass_count,
                "fail_count": fail_count,
                "total_pages": len(pages),
            }
        },
        "pages": serialized_pages,
        "report": serialized_report,
    }


@app.get("/api/admin/users/details")
async def admin_users_details(_: dict[str, Any] = Depends(get_current_admin)):
    users = await get_db().users.find({}).sort("created_at", -1).to_list(length=10000)
    admin_count = sum(1 for u in users if u.get("role") == UserRole.ADMIN.value)
    auditor_count = sum(1 for u in users if u.get("role") == UserRole.AUDITOR.value)
    return {
        "totals": {
            "admins": admin_count,
            "auditors": auditor_count,
            "users": len(users),
        },
        "users": [
            {
                "id": str(user["_id"]),
                "username": user.get("username"),
                "role": user.get("role"),
                "password_hash": user.get("password_hash"),
                "employee_details": user.get("employee_details", {}),
                "audited_document_ids": user.get("audited_document_ids", []),
                "created_at": user.get("created_at").isoformat()
                if isinstance(user.get("created_at"), datetime)
                else user.get("created_at"),
            }
            for user in users
        ],
    }


@app.get("/api/admin/documents/details")
async def admin_documents_details(
    year: int | None = None,
    month: int | None = None,
    day: int | None = None,
    limit: int = 50,
    _: dict[str, Any] = Depends(get_current_admin),
):
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 500")

    date_filter = _build_date_filter(year=year, month=month, day=day)
    query: dict[str, Any] = {"status": "completed"}
    if date_filter:
        query["analyzed_at"] = date_filter

    docs = (
        await get_db()
        .documents.find(query)
        .sort("analyzed_at", -1)
        .limit(limit)
        .to_list(length=limit)
    )

    auditors = await get_db().users.find({"role": UserRole.AUDITOR.value}).to_list(length=20000)
    auditor_map = {str(a["_id"]): a for a in auditors}

    total_docs = await get_db().documents.count_documents(query)
    return {
        "filters": {"year": year, "month": month, "day": day, "limit": limit},
        "total_documents": total_docs,
        "recent_documents": [
            {
                "id": str(doc["_id"]),
                "filename": doc.get("filename"),
                "status": doc.get("status"),
                "size_mb": doc.get("size_mb"),
                "created_at": doc.get("created_at").isoformat()
                if isinstance(doc.get("created_at"), datetime)
                else doc.get("created_at"),
                "analyzed_at": doc.get("analyzed_at").isoformat()
                if isinstance(doc.get("analyzed_at"), datetime)
                else doc.get("analyzed_at"),
                "auditor_id": str(doc.get("auditor_id")),
                "auditor_username": auditor_map.get(str(doc.get("auditor_id")), {}).get("username"),
                "report_id": str(doc.get("report_id")) if doc.get("report_id") else None,
                "page_count": len(doc.get("page_ids", [])),
            }
            for doc in docs
        ],
    }


@app.delete("/api/job/{job_id}")
async def cleanup_job(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    if not ObjectId.is_valid(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    oid = ObjectId(job_id)
    doc = await get_db().documents.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Job not found")
    await _authorize_document_access(doc, current_user)

    fp = Path(doc["file_path"])
    if fp.exists():
        fp.unlink(missing_ok=True)

    await get_db().reports.delete_many({"document_id": oid})
    await get_db().pages.delete_many({"document_id": oid})
    await get_db().documents.delete_one({"_id": oid})
    await get_db().users.update_one(
        {"_id": doc["auditor_id"]},
        {"$pull": {"audited_document_ids": job_id}},
    )
    return {"message": "Job cleaned up"}


@app.put("/api/documents/{document_id}/page/{page_number}/status")
async def update_page_status(
    document_id: str,
    page_number: int,
    payload: PageStatusUpdateRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Update the manual status of a page (manual_pass or manual_fail)"""
    if not ObjectId.is_valid(document_id):
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc_oid = ObjectId(document_id)
    doc = await get_db().documents.find_one({"_id": doc_oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    await _authorize_document_access(doc, current_user)
    
    # Validate status is one of the allowed values
    if payload.status not in ["pass", "fail", "manual_pass", "manual_fail"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be: pass, fail, manual_pass, or manual_fail")
    
    # Update the page status
    result = await get_db().pages.update_one(
        {"document_id": doc_oid, "page_number": page_number},
        {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    
    return {"message": "Page status updated", "status": payload.status}


@app.get("/api/reports/{report_id}")
async def get_report_details(
    report_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Get report details with pages and summary"""
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    
    report_oid = ObjectId(report_id)
    report = await get_db().reports.find_one({"_id": report_oid})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Get the associated document
    doc = await get_db().documents.find_one({"_id": report["document_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Associated document not found")
    
    await _authorize_document_access(doc, current_user)
    
    # Get all pages for this report's document
    pages = await get_db().pages.find({"document_id": report["document_id"]}).sort("page_number", 1).to_list(length=5000)
    
    serialized_pages = []
    pass_count = 0
    fail_count = 0
    critical_count = 0
    warnings_count = 0
    
    for page in pages:
        status = page.get("status", "unknown")
        if status in ["pass", "manual_pass"]:
            pass_count += 1
        elif status in ["fail", "manual_fail"]:
            fail_count += 1
        
        # Count critical issues and warnings from page summaries
        if "critical" in page.get("summary_text", "").lower():
            critical_count += 1
        if "warning" in page.get("summary_text", "").lower():
            warnings_count += 1
        
        serialized_pages.append({
            "page_number": page.get("page_number"),
            "status": status,
            "findings": [page.get("summary_text", "")] if page.get("summary_text") else [],
        })
    
    return {
        "report": {
            "id": str(report["_id"]),
            "document_filename": doc.get("filename", ""),
            "report_data": report.get("summary_text", ""),
            "status": "completed",
            "created_at": report.get("created_at").isoformat()
            if isinstance(report.get("created_at"), datetime)
            else report.get("created_at"),
            "pages": serialized_pages,
            "summary": {
                "pass_count": pass_count,
                "fail_count": fail_count,
                "total_pages": len(pages),
                "critical_issues": critical_count,
                "warnings": warnings_count,
            }
        }
    }


@app.put("/api/reports/{report_id}/page/{page_number}/status")
async def update_report_page_status(
    report_id: str,
    page_number: int,
    payload: PageStatusUpdateRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Update the manual status of a report page (manual_pass or manual_fail)"""
    if not ObjectId.is_valid(report_id):
        raise HTTPException(status_code=404, detail="Report not found")
    
    report_oid = ObjectId(report_id)
    report = await get_db().reports.find_one({"_id": report_oid})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Get the associated document to check authorization
    doc = await get_db().documents.find_one({"_id": report["document_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Associated document not found")
    
    await _authorize_document_access(doc, current_user)
    
    # Validate status
    if payload.status not in ["pass", "fail", "manual_pass", "manual_fail"]:
        raise HTTPException(status_code=400, detail="Invalid status. Must be: pass, fail, manual_pass, or manual_fail")
    
    # Update the page status using the document_id from the report
    result = await get_db().pages.update_one(
        {"document_id": report["document_id"], "page_number": page_number},
        {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Page not found")
    
    return {"message": "Page status updated", "status": payload.status}


if __name__ == "__main__":
    _uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
