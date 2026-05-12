"""
BMR Audit System — FastAPI Application Entry Point.

Startup sequence
────────────────
1. Configure structured logging (console + rotating file under ./logs/).
2. Launch the local math server (port 8001) in a background daemon thread.
3. Expose REST + WebSocket endpoints for the React frontend.

Endpoints
─────────
  GET    /                       — health check
  GET    /api/test-math          — verify local math server is running
  POST   /api/math/calculate     — direct math calculation (for testing)
  POST   /api/upload             — upload BMR PDF → returns job_id
  WS     /api/audit/{job_id}     — stream audit results to frontend
  GET    /api/status/{job_id}    — poll job status
  DELETE /api/job/{job_id}       — clean up job + uploaded file
"""

# ─────────────────────────────────────────────────────────────────────────────
# Logging must be configured FIRST — before any application imports — so that
# every module picks up the handlers set here.
# ─────────────────────────────────────────────────────────────────────────────
import logging
import logging.handlers
from pathlib import Path
import sys

# ── Log directory ─────────────────────────────────────────────────────────────
_LOG_DIR = Path(__file__).resolve().parent / "logs"
_LOG_DIR.mkdir(exist_ok=True)
_LOG_FILE = _LOG_DIR / "audit.log"

# ── Formatter ─────────────────────────────────────────────────────────────────
_FMT = "%(asctime)s | %(levelname)-8s | %(name)-22s | %(message)s"
_DATE_FMT = "%Y-%m-%d %H:%M:%S"
_formatter = logging.Formatter(_FMT, datefmt=_DATE_FMT)

# ── Handlers ──────────────────────────────────────────────────────────────────
_console_handler = logging.StreamHandler(sys.stdout)
_console_handler.setFormatter(_formatter)
_console_handler.setLevel(logging.DEBUG)

_file_handler = logging.handlers.RotatingFileHandler(
    _LOG_FILE,
    maxBytes=10 * 1024 * 1024,   # 10 MB
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(_formatter)
_file_handler.setLevel(logging.DEBUG)

# ── Root logger ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    handlers=[_console_handler, _file_handler],
)

# Quiet noisy third-party loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn.error").setLevel(logging.INFO)
logging.getLogger("watchfiles").setLevel(logging.WARNING)

# ─────────────────────────────────────────────────────────────────────────────
# Application imports (after logging is configured)
# ─────────────────────────────────────────────────────────────────────────────
import os
import uuid
import asyncio
import threading
import time
from contextlib import asynccontextmanager
from typing import Dict

import uvicorn as _uvicorn
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import aiofiles
from starlette.websockets import WebSocketState

from local_math_server import math_app          # local math FastAPI app
from gemini_service import audit_service        # BMR audit service
from math_api_service import math_api_service   # local math client

log = logging.getLogger("main")

# ─── Upload directory ─────────────────────────────────────────────────────────
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))
UPLOAD_CHUNK_SIZE_BYTES = int(os.getenv("UPLOAD_CHUNK_SIZE_BYTES", str(1024 * 1024)))

# ─── Job store ────────────────────────────────────────────────────────────────
jobs: Dict[str, dict] = {}

# ─── Local math server thread ─────────────────────────────────────────────────
_MATH_SERVER_PORT = int(os.getenv("MATH_SERVER_PORT", "8001"))
_math_server_thread: threading.Thread | None = None


def _run_local_math_server() -> None:
    """
    Target for the background daemon thread that hosts the local math server.
    Uses a separate uvicorn instance on port 8001.
    """
    log.info(
        "+- Local Math Server ------------------------------------------------"
    )
    log.info("|  Starting on http://127.0.0.1:%d", _MATH_SERVER_PORT)
    log.info(
        "+--------------------------------------------------------------------"
    )
    _uvicorn.run(
        math_app,
        host="127.0.0.1",
        port=_MATH_SERVER_PORT,
        log_level="warning",   # math_app logs via our handlers
        access_log=False,
    )


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager.

    Startup:
      1. Start local math server in a daemon thread.
      2. Wait up to 5 s for it to be reachable.
      3. Run a live arithmetic test (10 + 5 = 15).

    Shutdown:
      Daemon thread exits automatically when the main process exits.
    """
    global _math_server_thread

    log.info("=" * 68)
    log.info("  BMR AUDIT SYSTEM - STARTING UP")
    log.info("  Log file: %s", _LOG_FILE)
    log.info("=" * 68)

    # -- Launch math server ----------------------------------------------------
    _math_server_thread = threading.Thread(
        target=_run_local_math_server,
        daemon=True,
        name="LocalMathServer",
    )
    _math_server_thread.start()
    log.info("Local math server thread started (daemon=True, port=%d)", _MATH_SERVER_PORT)

    # ── Wait for math server to become reachable ──────────────────────────────
    import httpx as _httpx
    health_url = f"http://127.0.0.1:{_MATH_SERVER_PORT}/math/health"
    ready = False
    for attempt in range(1, 16):   # up to ~5 s
        await asyncio.sleep(0.35)
        try:
            async with _httpx.AsyncClient(timeout=1.5) as client:
                r = await client.get(health_url)
            if r.status_code == 200:
                ready = True
                log.info(
                    "Local math server ready after %.1f s (attempt %d)",
                    attempt * 0.35,
                    attempt,
                )
                break
        except Exception:
            pass   # still starting

    if not ready:
        log.error(
            "Local math server did NOT become reachable within 5 s. "
            "Math calculations will fail during this session."
        )
    else:
        # ── Live smoke test ───────────────────────────────────────────────────
        test = await math_api_service.test_connection()
        if test["working"]:
            log.info("Math server smoke test: PASS  (%s)", test["message"])
        else:
            log.warning("Math server smoke test: FAIL  (%s)", test["message"])

    # ── Log model config ──────────────────────────────────────────────────────
    log.info(
        "AI model: %s | configured=%s",
        getattr(audit_service, "model_id", "unknown"),
        audit_service.is_configured(),
    )

    log.info("=" * 68)
    log.info("  BMR AUDIT SYSTEM - READY  ->  http://0.0.0.0:8000")
    log.info("  Math server            ->  http://127.0.0.1:%d", _MATH_SERVER_PORT)
    log.info("  API docs               ->  http://0.0.0.0:8000/docs")
    log.info("  Math server docs       ->  http://127.0.0.1:%d/math/docs", _MATH_SERVER_PORT)
    log.info("  Logs                   ->  %s", _LOG_FILE)
    log.info("=" * 68)

    yield   # ← application runs here

    log.info("BMR Audit System shutting down.")


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="BMR Audit System",
    description=(
        "Pharmaceutical Batch Manufacturing Record Audit powered by "
        "Gemma-4-31b-it AI with a local Python math engine for "
        "zero-trust numerical verification."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    """System health check."""
    math_ok = (await math_api_service.test_connection())["working"]
    return {
        "status": "healthy",
        "service": "BMR Audit System",
        "ai_model": getattr(audit_service, "model_id", "unknown"),
        "ai_configured": audit_service.is_configured(),
        "math_server": "local_python",
        "math_server_ok": math_ok,
    }


# ─── Math test endpoints ──────────────────────────────────────────────────────

@app.get("/api/test-math")
async def test_math():
    """
    Verify the local math server is running and returns correct results.
    Runs: 10 + 5 = 15, (98.5 - 2.1) / 99.7 * 100, sqrt(49).
    """
    log.info("Manual math server test requested via /api/test-math")
    basic = await math_api_service.test_connection()

    extra = {}
    if basic["working"]:
        # Test evaluate (full BODMAS)
        try:
            r1 = await math_api_service.evaluate_expression(
                "(98.5 - 2.1) / 99.7 * 100"
            )
            extra["yield_percent_test"] = {
                "expression": "(98.5 - 2.1) / 99.7 * 100",
                "result": r1.get("result"),
                "steps": r1.get("steps"),
            }
        except Exception as e:
            extra["yield_percent_test"] = {"error": str(e)}

        # Test sqrt
        try:
            r2 = await math_api_service.calculate("sqrt", number=49)
            extra["sqrt_test"] = {"sqrt(49)": r2.get("result")}
        except Exception as e:
            extra["sqrt_test"] = {"error": str(e)}

        # Test percentage
        try:
            r3 = await math_api_service.percentage(98.5, 100)
            extra["percentage_test"] = {"98.5/100*100": r3.get("result")}
        except Exception as e:
            extra["percentage_test"] = {"error": str(e)}

    return JSONResponse({**basic, **extra})


@app.post("/api/math/calculate")
async def math_calculate(payload: dict):
    """
    Directly invoke the local math server.

    Examples:
        POST /api/math/calculate
        Body: { "operation": "add", "a": 10, "b": 5 }
              { "operation": "evaluate", "expression": "(98.5 - 2.1) / 99.7 * 100" }
              { "operation": "percentage", "a": 98.5, "b": 100 }
    """
    operation = payload.get("operation")
    if not operation:
        raise HTTPException(
            status_code=400, detail="'operation' field is required."
        )

    log.info("Direct math API call: %s", payload)
    kwargs = {k: v for k, v in payload.items() if k != "operation"}
    try:
        result = await math_api_service.calculate(operation, **kwargs)
        return JSONResponse({"status": "ok", "data": result})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Upload endpoint ──────────────────────────────────────────────────────────

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a BMR PDF for audit processing.  Returns a job_id.
    Connect to WS /api/audit/{job_id} after this to receive results.
    """
    if not audit_service.is_configured():
        log.error("Upload rejected — AI model not configured")
        raise HTTPException(
            status_code=503,
            detail=(
                "AI model not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY "
                "and MISTRAL_API_KEY (or create backend/local_api_key.txt and "
                "backend/local_mistral_api_key.txt), then restart."
            ),
        )

    filename = file.filename or "unnamed"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    job_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{job_id}.pdf"
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
            try:
                file_path.unlink()
            except Exception:
                pass
        raise
    finally:
        await file.close()

    if total_bytes == 0:
        if file_path.exists():
            try:
                file_path.unlink()
            except Exception:
                pass
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    size_mb = total_bytes / (1024 * 1024)
    upload_ts = time.time()
    jobs[job_id] = {
        "status":       "uploaded",
        "filename":     filename,
        "file_path":    str(file_path),
        "size_mb":      round(size_mb, 2),
        "result":       None,
        "created_at":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "upload_ts":    upload_ts,  # precise unix timestamp for timer
    }

    # Clean up stale jobs older than 1 hour to prevent memory leaks
    stale_cutoff = upload_ts - 3600
    stale_ids = [
        jid for jid, jdata in jobs.items()
        if jdata.get("upload_ts", 0) < stale_cutoff and jid != job_id
    ]
    for stale_id in stale_ids:
        stale_job = jobs.pop(stale_id, None)
        if stale_job:
            stale_fp = Path(stale_job["file_path"])
            if stale_fp.exists():
                try:
                    stale_fp.unlink()
                except Exception:
                    pass
            log.info("Cleaned up stale job %s (age > 1h)", stale_id)

    log.info(
        "UPLOAD  job_id=%s  file=%r  size=%.2f MB",
        job_id, filename, size_mb,
    )

    return JSONResponse({
        "job_id":   job_id,
        "filename": filename,
        "size_mb":  round(size_mb, 2),
        "message":  "File uploaded. Connect to WebSocket to start audit.",
    })


# ─── WebSocket streaming endpoint ────────────────────────────────────────────

@app.websocket("/api/audit/{job_id}")
async def websocket_audit(websocket: WebSocket, job_id: str):
    """
    Stream BMR audit results to the frontend.

    Message types sent to client:
      { "type": "status",  "status": "processing", "message": "..." }
      { "type": "pipeline", "stage": "<stage_key>", "message": "...", "meta": {...} }
      { "type": "content", "markdown": "<chunk>" }
      { "type": "status",  "status": "completed",  "message": "..." }
      { "type": "error",   "message": "<error text>" }
    """
    await websocket.accept()
    log.info("WS CONNECT  job_id=%s", job_id)
    connection_active = True

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
            if 'close message has been sent' in str(exc).lower():
                connection_active = False
                return False
            raise

    if job_id not in jobs:
        log.warning("WS job not found: %s", job_id)
        await send_json_safe({"type": "error", "message": "Job not found"})
        try:
            await websocket.close()
        except Exception:
            pass
        return

    job = jobs[job_id]
    job["status"] = "processing"
    t_start = time.perf_counter()

    try:
        async def emit_pipeline(stage: str, message: str, meta: dict | None = None) -> None:
            await send_json_safe({
                "type": "pipeline",
                "stage": stage,
                "message": message,
                "meta": meta or {},
            })

        if not await send_json_safe({
            "type":    "status",
            "status":  "processing",
            "message": (
                f"Audit started — {job['filename']} "
                f"({job['size_mb']} MB). Local math engine ready."
            ),
        }):
            job["status"] = "disconnected"
            log.info("WS disconnected before processing start  job_id=%s", job_id)
            return
        await emit_pipeline(
            "upload_received",
            "File uploaded and accepted by backend.",
            {
                "filename": job["filename"],
                "size_mb": job["size_mb"],
                "timer_start_ts": job.get("upload_ts", time.time()),
            },
        )
        log.info(
            "AUDIT START  job_id=%s  file=%r",
            job_id, job["filename"],
        )

        chunk_count = 0
        async for chunk in audit_service.process_bmr(job["file_path"], status_cb=emit_pipeline):
            if not await send_json_safe({
                "type":     "content",
                "markdown": chunk,
            }):
                job["status"] = "disconnected"
                log.info("WS disconnected mid-stream  job_id=%s", job_id)
                return
            chunk_count += 1

        elapsed = time.perf_counter() - t_start
        job["status"] = "completed"

        log.info(
            "AUDIT COMPLETE  job_id=%s  chunks=%d  elapsed=%.1f s",
            job_id, chunk_count, elapsed,
        )

        if not await send_json_safe({
            "type":    "status",
            "status":  "completed",
            "message": f"Audit complete in {elapsed:.1f} s — {chunk_count} output chunk(s).",
        }):
            job["status"] = "disconnected"
            log.info("WS disconnected before completion message  job_id=%s", job_id)
            return
        await emit_pipeline(
            "audit_completed",
            "Audit pipeline completed.",
            {"elapsed_s": round(elapsed, 1), "chunks": chunk_count},
        )

    except WebSocketDisconnect:
        job["status"] = "disconnected"
        log.info("WS DISCONNECT  job_id=%s", job_id)

    except Exception as exc:
        elapsed = time.perf_counter() - t_start
        job["status"] = "error"
        log.exception(
            "AUDIT ERROR  job_id=%s  elapsed=%.1f s  error=%s",
            job_id, elapsed, exc,
        )
        await send_json_safe({
            "type":    "error",
            "message": str(exc),
        })


# ─── Status / cleanup ─────────────────────────────────────────────────────────

@app.get("/api/status/{job_id}")
async def get_job_status(job_id: str):
    """Poll the status of an audit job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@app.delete("/api/job/{job_id}")
async def cleanup_job(job_id: str):
    """Delete an audit job and remove the uploaded file."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs.pop(job_id)
    fp = Path(job["file_path"])
    if fp.exists():
        fp.unlink()
        log.info("Cleaned up job %s — deleted %s", job_id, fp.name)

    return {"message": "Job cleaned up"}


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
