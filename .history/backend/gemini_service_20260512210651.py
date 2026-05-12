"""
Gemini API service for BMR audit processing.

Architecture
───────────
• Model     : Gemma 4 31B IT (gemma-4-31b-it, locked)
• Math tool : Local Math Engine (localhost:8001)

When the model needs a calculation it emits a `calculate_math` function call.
The backend catches that call, routes it to the local math server, and feeds
the verified result back so the model can continue building the audit tables.
"""

import logging
import base64
from contextlib import suppress
from google import genai
from google.genai import types
from typing import AsyncGenerator, Awaitable, Callable
import asyncio
import os
import re
import math
import httpx
from pathlib import Path
from pypdf import PdfReader, PdfWriter
from prompts import (
    MAX_OUTPUT_TOKENS as PROMPT_MAX_OUTPUT_TOKENS,
    get_system_instruction,
    get_audit_prompt,
)
from math_api_service import math_api_service

log = logging.getLogger("gemini_service")
PipelineStatusCallback = Callable[[str, str, dict], Awaitable[None]]

# ─── constants / env ────────────────────────────────────────────────────────
PDF_COMPRESSION_TRIGGER_MB = float(os.getenv("PDF_COMPRESSION_TRIGGER_MB", "20"))
MAX_SUPPORTED_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))
LOCAL_API_KEY_FILE = Path(__file__).resolve().parent / "local_api_key.txt"
LOCAL_MISTRAL_API_KEY_FILE = Path(__file__).resolve().parent / "local_mistral_api_key.txt"
MISTRAL_OCR_ENDPOINT = os.getenv("MISTRAL_OCR_ENDPOINT", "https://api.mistral.ai/v1/ocr")
MISTRAL_OCR_MODEL = os.getenv("MISTRAL_OCR_MODEL", "mistral-ocr-latest")
OCR_TEXT_MAX_CHARS = int(os.getenv("OCR_TEXT_MAX_CHARS", "900000"))


def _load_api_key() -> str:
    """Load Gemini API key: env vars first, then local file."""
    env_key = (
        os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )
    if env_key:
        return env_key
    if LOCAL_API_KEY_FILE.exists():
        try:
            return LOCAL_API_KEY_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            return ""
    return ""


def _load_mistral_api_key() -> str:
    """Load Mistral API key: env vars first, then local file."""
    env_key = os.getenv("MISTRAL_API_KEY", "").strip()
    if env_key:
        return env_key
    if LOCAL_MISTRAL_API_KEY_FILE.exists():
        try:
            return LOCAL_MISTRAL_API_KEY_FILE.read_text(encoding="utf-8").strip()
        except OSError:
            return ""
    return ""


GEMINI_API_KEY = _load_api_key()
HAS_API_KEY = bool(GEMINI_API_KEY)

# Model / feature flags
# Model is hard-locked to Gemma 4 31B IT for this deployment.
DEFAULT_MODEL_ID = "gemma-4-31b-it"
GENERATION_TEMPERATURE = float(os.getenv("GENERATION_TEMPERATURE", "0.2"))
GENERATION_TOP_P = float(os.getenv("GENERATION_TOP_P", "0.9"))
GENERATION_TOP_K = int(os.getenv("GENERATION_TOP_K", "40"))
GENERATION_MEDIA_RESOLUTION = types.MediaResolution.MEDIA_RESOLUTION_HIGH
MODEL_SERVER_RETRIES = max(1, int(os.getenv("MODEL_SERVER_RETRIES", "1")))
MODEL_SERVER_RETRY_BASE_SECONDS = float(os.getenv("MODEL_SERVER_RETRY_BASE_SECONDS", "3"))
MODEL_SERVER_RETRY_MAX_SECONDS = float(os.getenv("MODEL_SERVER_RETRY_MAX_SECONDS", "90"))
MODEL_SERVER_REQUEST_TIMEOUT_SECONDS = float(
    os.getenv("MODEL_SERVER_REQUEST_TIMEOUT_SECONDS", "0")
)
OUTPUT_REPAIR_TIMEOUT_SECONDS = float(
    os.getenv("OUTPUT_REPAIR_TIMEOUT_SECONDS", "20")
)
MODEL_FALLBACK_MEDIA_RESOLUTION = types.MediaResolution.MEDIA_RESOLUTION_MEDIUM
MODEL_ALLOW_MEDIA_RESOLUTION_DOWNGRADE = os.getenv(
    "MODEL_ALLOW_MEDIA_RESOLUTION_DOWNGRADE", "false"
).strip().lower() in {
    "1", "true", "yes", "on"
}
MODEL_SERVER_RETRY_OCR_CHARS = int(os.getenv("MODEL_SERVER_RETRY_OCR_CHARS", "450000"))
MATH_CALLS_FORCE_FINALIZE_THRESHOLD = max(
    1, int(os.getenv("MATH_CALLS_FORCE_FINALIZE_THRESHOLD", "12"))
)

EMIT_CALCULATION_TRACE = os.getenv("EMIT_CALCULATION_TRACE", "true").strip().lower() in {
    "1", "true", "yes", "on"
}
# TABLE_ONLY_OUTPUT=False: pass ALL model output (text + tables) to the frontend.
# The model produces section headers, table titles, and tables — all should display.
TABLE_ONLY_OUTPUT = os.getenv("TABLE_ONLY_OUTPUT", "false").strip().lower() in {
    "1", "true", "yes", "on"
}

# Maximum number of function-call / APIVerve rounds per audit
MAX_AGENTIC_ROUNDS = int(os.getenv("MAX_AGENTIC_ROUNDS", "25"))

# Maximum function-call turns to keep in conversation before pruning old ones.
# This prevents context explosion which causes 500 INTERNAL errors.
MAX_CONVERSATION_HISTORY_TURNS = int(os.getenv("MAX_CONVERSATION_HISTORY_TURNS", "2"))

# Gemini client (None when key absent so FastAPI can still boot)
client = genai.Client(api_key=GEMINI_API_KEY) if HAS_API_KEY else None


# ─── APIVerve Math function declaration ─────────────────────────────────────
# This is what we expose to Gemini so it can request verified calculations.
# Key design: complex BMR formulas like Yield% = (Actual/Theoretical)*100
# MUST be broken into steps:
#   Step 1: divide(a=Actual, b=Theoretical)  → intermediate
#   Step 2: multiply(a=intermediate, b=100)   → final %
# The model handles this chaining naturally via multiple sequential function calls.
_MATH_FUNCTION_DECLARATION = types.FunctionDeclaration(
    name="calculate_math",
    description=(
        "Perform a SINGLE arithmetic operation via the local math engine for BMR numerical verification. "
        "IMPORTANT: For complex BMR formulas, break them into sequential steps and call this "
        "function ONCE per step. Examples:\n"
        "  Yield% = (Actual / Theoretical) * 100:\n"
        "    Call 1: divide(a=Actual_value, b=Theoretical_value) → get ratio\n"
        "    Call 2: multiply(a=ratio, b=100) → get percentage\n"
        "  Weight Balance: Gross - Tare = Net:\n"
        "    Call 1: subtract(a=Gross, b=Tare) → get Net\n"
        "  Accountability% = (Total_Accounted / Theoretical) * 100:\n"
        "    Call 1: divide(a=Total_Accounted, b=Theoretical) → ratio\n"
        "    Call 2: multiply(a=ratio, b=100) → percentage\n"
        "  Row sum: add(a=val1, b=val2), then add(a=sum1, b=val3), etc.\n"
        "  % Deviation: |Actual-Theoretical|/Theoretical*100:\n"
        "    Call 1: subtract(a=Actual, b=Theoretical) → diff (use abs in next step)\n"
        "    Call 2: divide(a=abs_diff, b=Theoretical) → ratio\n"
        "    Call 3: multiply(a=ratio, b=100) → deviation%\n"
        "For simple single-step operations use: add, subtract, multiply, divide, power, sqrt.\n"
        "ALWAYS call this function for EVERY numeric check — never compute inline."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "operation": types.Schema(
                type=types.Type.STRING,
                description=(
                    "Arithmetic operation: 'add' | 'subtract' | 'multiply' | 'divide' | "
                    "'power' | 'sqrt'. "
                    "For multi-step BMR formulas, use one operation per call and chain results."
                ),
            ),
            "a": types.Schema(
                type=types.Type.NUMBER,
                description=(
                    "First operand. Can be a raw document value OR the result returned from "
                    "a previous calculate_math call (for chaining multi-step formulas)."
                ),
            ),
            "b": types.Schema(
                type=types.Type.NUMBER,
                description=(
                    "Second operand. For multiply-by-100 (percentage conversion) pass b=100."
                ),
            ),
            "number": types.Schema(
                type=types.Type.NUMBER,
                description="Single number operand — used only for 'sqrt'.",
            ),
        },
        required=["operation"],
    ),
)

# Tool that will be attached to the generation config
_MATH_TOOL = types.Tool(function_declarations=[_MATH_FUNCTION_DECLARATION])


class GemmaAuditService:
    """Service for processing BMR documents with Gemini + local math verification."""

    EXPECTED_TABLE_HEADERS = [
        [
            "Page", "Section", "Status (PASS/FAIL/VOIDED)",
            "Batch Check", "Signature Check", "Date Check", "Math Check",
            "Handwriting/Cross-Out", "Dynamic Check", "Key Findings",
        ],
        [
            "Page", "Operation Type", "Operands", "Computed", "Printed",
            "Delta", "Result (MISMATCH/ROUNDED/OK)", "Evidence",
        ],
        ["Page", "Field", "Required Role", "Signed (Y/N)", "Dated (Y/N)", "Issue"],
        [
            "Page", "Field/Location", "Date Found", "Normalised Date",
            "Issue Type", "Details",
        ],
        ["Page", "Field/Location", "Expected Batch", "Found Batch", "Issue"],
        [
            "Page", "Type (VOIDED/DUPLICATE/SECTION CROSSED)",
            "Initialled (Y/N)", "Dated (Y/N)", "Expected (Y/N)", "Notes",
        ],
        ["Page", "New Element", "Criterion Applied", "Result (PASS/FAIL)", "Details"],
        ["Metric", "Value"],
    ]

    def __init__(self) -> None:
        self.model_id = self._resolve_model_id()
        self.emit_calculation_trace = EMIT_CALCULATION_TRACE
        self.table_only_output = TABLE_ONLY_OUTPUT

        # Primary config: APIVerve math function tool
        self.generation_config = self._build_generation_config(use_math_tool=True)
        # Fallback config: no tools (pure text, used if function calling unsupported)
        self.fallback_generation_config = self._build_generation_config(use_math_tool=False)

    @staticmethod
    def _normalize_model_id(raw_model: str) -> str:
        """Normalize model id format for Gemini API requests."""
        model_id = re.sub(r"\s+", "-", raw_model.lower())
        model_id = model_id.replace("_", "-")
        model_id = re.sub(r"-{2,}", "-", model_id).strip("-")
        model_id = re.sub(r"-model$", "", model_id)
        return model_id

    @classmethod
    def _resolve_model_id(cls) -> str:
        """Resolve and normalize model id (single-model mode)."""
        requested = os.getenv("GEMINI_MODEL_ID", "").strip()
        normalized_default = cls._normalize_model_id(DEFAULT_MODEL_ID)
        if requested:
            normalized_requested = cls._normalize_model_id(requested)
            if normalized_requested != normalized_default:
                log.warning(
                    "Ignoring GEMINI_MODEL_ID=%s; model is locked to %s",
                    requested,
                    normalized_default,
                )
        return normalized_default

    # ── table parsing helpers ─────────────────────────────────────────────

    @staticmethod
    def _is_markdown_table_line(line: str) -> bool:
        stripped = line.strip()
        return len(stripped) >= 3 and stripped.startswith("|") and stripped.endswith("|")

    @staticmethod
    def _is_separator_row(line: str) -> bool:
        stripped = line.strip()
        if not stripped.startswith("|") or not stripped.endswith("|"):
            return False
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if not cells:
            return False
        return all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells)

    @classmethod
    def _is_table_header_start(cls, lines: list[str], index: int) -> bool:
        if index < 0 or index >= len(lines) - 1:
            return False
        line = lines[index]
        next_line = lines[index + 1]
        return (
            cls._is_markdown_table_line(line)
            and not cls._is_separator_row(line)
            and cls._is_separator_row(next_line)
        )

    @staticmethod
    def _column_count(line: str) -> int:
        stripped = line.strip()
        if not stripped.startswith("|") or not stripped.endswith("|"):
            return 0
        return len(stripped.strip("|").split("|"))

    @staticmethod
    def _make_row(cells: list[str]) -> str:
        return "| " + " | ".join(cells) + " |"

    @staticmethod
    def _make_separator(col_count: int) -> str:
        return "|" + "|".join(["---"] * max(col_count, 1)) + "|"

    @classmethod
    def _split_compact_table_line(cls, line: str) -> list[str]:
        """Split malformed compact table lines into valid markdown table rows."""
        stripped = line.strip()
        if not stripped:
            return []

        pieces: list[str] = []

        sep_and_rest = re.match(r"^((?:\|\s*:?-{3,}:?\s*)+\|)(.*)$", stripped)
        if sep_and_rest and sep_and_rest.group(2).strip():
            pieces.append(sep_and_rest.group(1).strip())
            stripped = sep_and_rest.group(2).strip()
            if stripped and not stripped.startswith("|"):
                stripped = "|" + stripped

        page_markers = list(re.finditer(r"\|\s*\d+\s*\|", stripped))
        if len(page_markers) <= 1:
            if stripped:
                pieces.append(stripped)
            return pieces

        for idx, marker in enumerate(page_markers):
            start = marker.start()
            end = page_markers[idx + 1].start() if idx + 1 < len(page_markers) else len(stripped)
            segment = stripped[start:end].strip()
            if segment and not segment.endswith("|"):
                segment += " |"
            if segment:
                pieces.append(segment)

        return pieces

    @classmethod
    def _normalize_table_block(cls, block: str) -> str:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        expanded_lines: list[str] = []
        for line in lines:
            expanded_lines.extend(cls._split_compact_table_line(line))

        if not expanded_lines:
            return ""

        header_index = None
        for index in range(len(expanded_lines) - 1):
            if (
                cls._is_markdown_table_line(expanded_lines[index])
                and not cls._is_separator_row(expanded_lines[index])
                and cls._is_separator_row(expanded_lines[index + 1])
            ):
                header_index = index
                break

        data_start = 0
        if header_index is not None:
            header_cells = [
                cell.strip()
                for cell in expanded_lines[header_index].strip().strip("|").split("|")
            ]
            data_start = header_index + 2
        else:
            first_table_line = next(
                (
                    line
                    for line in expanded_lines
                    if cls._is_markdown_table_line(line) and not cls._is_separator_row(line)
                ),
                None,
            )
            if first_table_line is None:
                return ""
            header_cells = [
                cell.strip() for cell in first_table_line.strip().strip("|").split("|")
            ]
            data_start = expanded_lines.index(first_table_line) + 1
            if data_start < len(expanded_lines) and cls._is_separator_row(expanded_lines[data_start]):
                data_start += 1

        max_data_columns = 0
        for line in expanded_lines[data_start:]:
            if cls._is_markdown_table_line(line) and not cls._is_separator_row(line):
                max_data_columns = max(max_data_columns, cls._column_count(line))

        expected_col_count = max(len(header_cells), max_data_columns, 2)
        if len(header_cells) < expected_col_count:
            header_cells.extend(
                f"Col {idx + 1}" for idx in range(len(header_cells), expected_col_count)
            )
        elif len(header_cells) > expected_col_count:
            header_cells = header_cells[:expected_col_count]

        header_row = cls._make_row(header_cells)
        separator_row = cls._make_separator(expected_col_count)
        normalized: list[str] = [header_row, separator_row]

        for line in expanded_lines[data_start:]:
            if not cls._is_markdown_table_line(line) or cls._is_separator_row(line):
                continue
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if len(cells) < expected_col_count:
                cells.extend([""] * (expected_col_count - len(cells)))
            elif len(cells) > expected_col_count:
                head = cells[: expected_col_count - 1]
                tail = " | ".join(cells[expected_col_count - 1 :])
                cells = head + [tail]
            normalized.append(cls._make_row(cells))

        if len(normalized) == 2:
            normalized.append(cls._make_row(["None"] * expected_col_count))

        return "\n".join(normalized)

    @classmethod
    def _keep_only_markdown_tables(cls, text: str) -> str:
        """Extract markdown table blocks and drop narrative/prose text."""
        lines = text.splitlines()
        table_blocks = []
        current_block = []
        in_table = False

        for index, line in enumerate(lines):
            if cls._is_markdown_table_line(line):
                if current_block and cls._is_table_header_start(lines, index):
                    while current_block and current_block[-1] == "":
                        current_block.pop()
                    if current_block:
                        table_blocks.append("\n".join(current_block))
                    current_block = []
                    in_table = False

                current_block.append(line)
                in_table = True
                continue

            if line.strip() == "" and in_table:
                current_block.append("")
                continue

            if in_table and current_block:
                while current_block and current_block[-1] == "":
                    current_block.pop()
                if current_block:
                    table_blocks.append("\n".join(current_block))
                current_block = []
                in_table = False

        if in_table and current_block:
            while current_block and current_block[-1] == "":
                current_block.pop()
            if current_block:
                table_blocks.append("\n".join(current_block))

        normalized_blocks = []
        for block in table_blocks:
            normalized = cls._normalize_table_block(block)
            if normalized:
                normalized_blocks.append(normalized)

        return "\n\n".join(normalized_blocks).strip()

    # ── internal helpers ──────────────────────────────────────────────────

    @staticmethod
    def _api_key_error_message() -> str:
        return (
            "Missing Gemini API key. Set GEMINI_API_KEY or GOOGLE_API_KEY, "
            "or create backend/local_api_key.txt with the key, then restart."
        )

    @staticmethod
    def _mistral_api_key_error_message() -> str:
        return (
            "Missing Mistral API key. Set MISTRAL_API_KEY, "
            "or create backend/local_mistral_api_key.txt with the key, then restart."
        )

    def _require_client(self):
        if client is None:
            raise RuntimeError(self._api_key_error_message())
        return client

    @staticmethod
    def _require_mistral_api_key() -> str:
        mistral_api_key = _load_mistral_api_key()
        if not mistral_api_key:
            raise RuntimeError(GemmaAuditService._mistral_api_key_error_message())
        return mistral_api_key

    def is_configured(self) -> bool:
        return client is not None and bool(_load_mistral_api_key())

    @staticmethod
    def _build_generation_config(
        use_math_tool: bool,
        system_instruction: str | None = None,
    ) -> types.GenerateContentConfig:
        """Build generation config, optionally attaching the APIVerve math tool."""
        config_kwargs: dict = {
            "temperature": GENERATION_TEMPERATURE,
            "top_p": GENERATION_TOP_P,
            "top_k": GENERATION_TOP_K,
            "max_output_tokens": 1, # 15k for reasoning / output
            "media_resolution": GENERATION_MEDIA_RESOLUTION,
            # Keep function-calling under explicit backend control.
            "automatic_function_calling": types.AutomaticFunctionCallingConfig(
                disable=True
            ),
        }
        
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        if use_math_tool:
            config_kwargs["tools"] = [_MATH_TOOL]
        return types.GenerateContentConfig(**config_kwargs)

    @staticmethod
    def _is_tool_unavailable_error(exc: Exception) -> bool:
        """Detect if a request failed because tooling is unsupported by the model."""
        msg = str(exc).lower()
        markers = ["tool", "function", "unsupported", "invalid argument", "not supported"]
        return any(m in msg for m in markers)

    @staticmethod
    def _is_retryable_model_error(exc: Exception) -> bool:
        """Detect transient upstream/model errors that should be retried."""
        msg = str(exc).lower()
        retry_markers = [
            "500 internal",
            "internal error encountered",
            "servererror",
            "status': 'internal'",
            "503",
            "504",
            "unavailable",
            "high demand",
            "timeout",
            "temporarily unavailable",
        ]
        return any(marker in msg for marker in retry_markers)

    @staticmethod
    def _is_capacity_error(exc: Exception) -> bool:
        """Detect provider-capacity/quota issues where shrinking payload won't help."""
        msg = str(exc).lower()
        markers = [
            "503",
            "unavailable",
            "high demand",
            "429",
            "resource exhausted",
            "resource_exhausted",
            "quota exceeded",
        ]
        return any(marker in msg for marker in markers)

    @staticmethod
    def _extract_retry_delay_seconds(exc: Exception) -> float | None:
        """
        Parse retry hints from provider errors, such as:
        - "Please retry in 56.3s"
        - "'retryDelay': '56s'"
        """
        msg = str(exc)
        patterns = [
            r"retry in\s+(\d+(?:\.\d+)?)s",
            r"retrydelay['\"]?\s*:\s*['\"](\d+(?:\.\d+)?)s['\"]",
        ]
        for pattern in patterns:
            match = re.search(pattern, msg, flags=re.IGNORECASE)
            if match:
                try:
                    delay = float(match.group(1))
                    if math.isfinite(delay) and delay > 0:
                        return delay
                except (TypeError, ValueError):
                    return None
        return None

    async def _generate_content_with_resilience(
        self,
        model_client,
        model_id: str,
        contents: list,
        config: types.GenerateContentConfig,
        loop: asyncio.AbstractEventLoop,
    ):
        """
        Call generate_content with retry/backoff for transient server failures.
        Retries with backoff; media-resolution downgrade is opt-in.
        """
        last_error: Exception | None = None
        retry_config = config

        for attempt in range(1, MODEL_SERVER_RETRIES + 1):
            try:
                model_request = loop.run_in_executor(
                    None,
                    lambda c=contents, cfg=retry_config: model_client.models.generate_content(
                        model=model_id,
                        contents=c,
                        config=cfg,
                    ),
                )
                if MODEL_SERVER_REQUEST_TIMEOUT_SECONDS > 0:
                    return await asyncio.wait_for(
                        model_request,
                        timeout=MODEL_SERVER_REQUEST_TIMEOUT_SECONDS,
                    )
                return await model_request
            except asyncio.TimeoutError:
                last_error = RuntimeError(
                    "Model request timed out after "
                    f"{MODEL_SERVER_REQUEST_TIMEOUT_SECONDS:.0f} seconds."
                )
                if attempt < MODEL_SERVER_RETRIES:
                    delay = MODEL_SERVER_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
                    log.warning(
                        "Model request timed out; retrying attempt %d/%d in %.1f s.",
                        attempt + 1,
                        MODEL_SERVER_RETRIES,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                break
            except Exception as exc:
                last_error = exc
                if not self._is_retryable_model_error(exc):
                    raise

                if (
                    MODEL_ALLOW_MEDIA_RESOLUTION_DOWNGRADE
                    and
                    attempt == 1
                    and getattr(retry_config, "media_resolution", None)
                    == types.MediaResolution.MEDIA_RESOLUTION_HIGH
                ):
                    retry_config = retry_config.model_copy(
                        update={"media_resolution": MODEL_FALLBACK_MEDIA_RESOLUTION}
                    )
                    log.warning(
                        "Transient model error; retrying with lower media resolution (%s). Error: %s",
                        MODEL_FALLBACK_MEDIA_RESOLUTION,
                        exc,
                    )
                elif attempt < MODEL_SERVER_RETRIES:
                    delay = MODEL_SERVER_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
                    hinted_delay = self._extract_retry_delay_seconds(exc)
                    if hinted_delay is not None:
                        delay = max(delay, hinted_delay)
                    delay = min(delay, MODEL_SERVER_RETRY_MAX_SECONDS)
                    if self._is_capacity_error(exc):
                        log.warning(
                            "Gemma API capacity/availability issue; retrying attempt %d/%d in %.1f s. Error: %s",
                            attempt + 1,
                            MODEL_SERVER_RETRIES,
                            delay,
                            exc,
                        )
                    else:
                        log.warning(
                            "Transient model error; retrying attempt %d/%d in %.1f s. Error: %s",
                            attempt + 1,
                            MODEL_SERVER_RETRIES,
                            delay,
                            exc,
                        )
                    await asyncio.sleep(delay)
                else:
                    break

        if last_error is not None:
            raise last_error
        raise RuntimeError("generate_content failed with unknown error")

    @staticmethod
    def _compact_ocr_text_in_contents(contents: list, max_chars: int) -> list:
        """
        Reduce OCR text payload size for retry attempts after server-side failures.
        """
        compacted = list(contents)
        for idx, content in enumerate(compacted):
            if getattr(content, "role", None) != "user":
                continue
            parts = list(getattr(content, "parts", None) or [])
            changed = False
            for pidx, part in enumerate(parts):
                text = getattr(part, "text", None)
                if not text or not text.startswith("OCR SOURCE:"):
                    continue
                if len(text) > max_chars:
                    parts[pidx] = types.Part.from_text(
                        text=text[:max_chars]
                        + "\n\n[OCR CONTENT TRUNCATED AFTER SERVER RETRY]"
                    )
                    changed = True
            if changed:
                compacted[idx] = types.Content(
                    role=getattr(content, "role", None) or "user",
                    parts=parts,
                )
                break
        return compacted

    @staticmethod
    def _condense_contents_for_fallback(contents: list, total_math_calls: int) -> list:
        """
        Trim agentic turn history for fallback retries while preserving the
        original user payload (PDF + OCR) and a small tail of math responses.
        """
        if not contents:
            return contents

        # Keep original user content but strip OCR text aggressively
        first_content = contents[0]
        first_parts = list(getattr(first_content, "parts", None) or [])
        trimmed_parts: list[types.Part] = []
        for part in first_parts:
            text = getattr(part, "text", None)
            if text and text.startswith("OCR SOURCE:"):
                # Keep only first 100K chars of OCR for fallback
                trimmed_parts.append(
                    types.Part.from_text(text=text[:100000] + "\n[OCR TRUNCATED FOR RETRY]")
                )
            elif getattr(part, "file_data", None) is not None:
                # Drop the massive PDF attachment entirely during fallback to prevent 500 INTERNAL
                continue
            else:
                trimmed_parts.append(part)
        condensed = [
            types.Content(
                role=getattr(first_content, "role", None) or "user",
                parts=trimmed_parts,
            )
        ]

        condensed.append(
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(
                        text=(
                            "Continue this audit as an independent retry. "
                            f"{total_math_calls} math validations were already executed. "
                            "Use the document and OCR context to produce the final required markdown report "
                            "in one response. Do NOT call calculate_math — produce the complete "
                            "audit report directly."
                        )
                    )
                ],
            )
        )
        return condensed

    @staticmethod
    def _prepare_system_instruction(system_instruction: str) -> str:
        """
        Prepare system instruction for model execution.
        Prepend the <|think|> token to enable Gemma 4 internal reasoning.
        """
        # Ensure it doesn't get double prepended
        cleaned = re.sub(
            r"^\s*<\|think\|>\s*",
            "",
            system_instruction,
            flags=re.IGNORECASE,
        ).strip()
        return f"<|think|>\n{cleaned}"

    @staticmethod
    def _strip_thought_blocks(text: str) -> str:
        """
        Remove Gemma thought-channel blocks from surfaced text output.
        Keeps only the final answer payload.
        """
        if not text:
            return text
        cleaned = text
        patterns = (
            r"<\|channel\|>\s*thought\s*[\r\n].*?<\|channel\|>",
            r"<\|channel>\s*thought\s*[\r\n].*?<channel\|>",
            r"<\|channel\|>\s*thought\s*<\|channel\|>",
            r"<\|channel>\s*thought\s*<channel\|>",
        )
        for pattern in patterns:
            cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE | re.DOTALL)
        return cleaned.strip()

    @staticmethod
    def _extract_model_function_call_content(response_obj) -> types.Content | None:
        """
        Keep only assistant/model function-call parts for conversation history.
        This avoids carrying thought text across turns in multi-turn loops.
        """
        candidates = getattr(response_obj, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            if not content:
                continue
            filtered_parts = [
                part
                for part in (getattr(content, "parts", None) or [])
                if getattr(part, "function_call", None) is not None
            ]
            if filtered_parts:
                return types.Content(
                    role=getattr(content, "role", None) or "model",
                    parts=filtered_parts,
                )
        return None

    @staticmethod
    def _extract_function_calls(response_obj) -> list:
        """
        Extract all function_call parts from a generate_content response.
        Returns a list of function_call objects (with .name and .args).
        """
        function_calls = []
        candidates = getattr(response_obj, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            if not content:
                continue
            for part in getattr(content, "parts", None) or []:
                fc = getattr(part, "function_call", None)
                if fc is not None:
                    function_calls.append(fc)
        return function_calls

    def _extract_markdown_and_tool_usage(self, response_obj) -> tuple[str, bool]:
        """Extract text from response parts; detect whether any tool/function was used."""
        text_parts = []
        tool_used = False

        candidates = getattr(response_obj, "candidates", None) or []
        for candidate in candidates:
            content = getattr(candidate, "content", None)
            parts = getattr(content, "parts", None) if content is not None else None
            if not parts:
                continue
            for part in parts:
                part_text = getattr(part, "text", None)
                if part_text:
                    text_parts.append(part_text)

                # Detect code execution (legacy path)
                if getattr(part, "executable_code", None) is not None:
                    tool_used = True
                    if self.emit_calculation_trace:
                        code = getattr(part.executable_code, "code", "")
                        if code:
                            text_parts.append(f"\n```python\n{code}\n```\n")

                if getattr(part, "code_execution_result", None) is not None:
                    tool_used = True
                    if self.emit_calculation_trace:
                        output = getattr(part.code_execution_result, "output", "")
                        if output:
                            text_parts.append(f"\n```text\n{output}\n```\n")

                # Detect function_call (APIVerve path)
                if getattr(part, "function_call", None) is not None:
                    tool_used = True

        return "".join(text_parts), tool_used

    @staticmethod
    def _build_initial_contents(
        user_brief: str,
        ocr_markdown: str,
        pdf_part: types.Part | None = None,
    ) -> list:
        """
        Build the initial multi-turn conversation content list.
        Uses proper types.Content so we can append model turns and function
        responses later in the agentic loop.
        """
        ocr_context = (
            "OCR SOURCE: The following text is from Mistral OCR "
            f"({MISTRAL_OCR_MODEL}).\n"
            "CRITICAL OCR USAGE RULES:\n"
            "1. OCR is a STARTING REFERENCE, NOT absolute truth. OCR frequently misreads "
            "handwritten numbers and dates.\n"
            "2. ALWAYS cross-check OCR numbers against mathematical plausibility. If an OCR value "
            "produces physically impossible results (negative net weights, impossible percentages), "
            "the OCR value is WRONG. Use the visually and mathematically correct value instead.\n"
            "3. OCR CANNOT detect crossed-out pages/sections. Even if OCR returns full text for a "
            "page, the page may be physically crossed out with diagonal lines in the PDF. You MUST "
            "check the PDF image for cross-out lines on EVERY page — do not assume a page is active "
            "just because OCR returned text.\n"
            "4. For dates near signatures, OCR often misreads year digits due to signature overlap. "
            "Use batch/process context to determine the correct year.\n"
            "5. Use OCR + PDF together for document structure/layout, signatures, boxes, and "
            "crossed-out sections. When OCR and PDF visual evidence conflict, prefer PDF visual.\n\n"
            f"{ocr_markdown}"
        )
        user_parts: list[types.Part] = []
        if pdf_part is not None:
            user_parts.append(pdf_part)
        user_parts.extend(
            [
                types.Part.from_text(text=user_brief),
                types.Part.from_text(text=ocr_context),
            ]
        )
        return [
            types.Content(
                role="user",
                parts=user_parts,
            )
        ]

    @staticmethod
    def _contents_have_numeric_ocr(contents: list) -> bool:
        """Best-effort check for numeric content in OCR payload."""
        for content in contents:
            if getattr(content, "role", None) != "user":
                continue
            for part in getattr(content, "parts", None) or []:
                text = getattr(part, "text", None)
                if not text or not text.startswith("OCR SOURCE:"):
                    continue
                if re.search(r"\d", text):
                    return True
        return False

    @staticmethod
    def _find_output_structure_issues(report_text: str, page_count: int) -> list[str]:
        """Validate that required page blocks and 7 table/Reasoning blocks exist."""
        issues: list[str] = []

        for page_num in range(1, page_count + 1):
            if not re.search(
                rf"^\s*##\s+PAGE\s+{page_num}\b",
                report_text,
                flags=re.IGNORECASE | re.MULTILINE,
            ):
                issues.append(f"Missing page block: ## PAGE {page_num}")

        for table_num in range(1, 8):
            reasoning_count = len(
                re.findall(
                    rf"^\s*##\s+Reasoning:\s+Table\s+{table_num}\b",
                    report_text,
                    flags=re.IGNORECASE | re.MULTILINE,
                )
            )
            table_count = len(
                re.findall(
                    rf"^\s*##\s+Table\s+{table_num}\s*:",
                    report_text,
                    flags=re.IGNORECASE | re.MULTILINE,
                )
            )
            if reasoning_count != 1:
                issues.append(
                    f"Table {table_num} reasoning section count is {reasoning_count}, expected 1"
                )
            if table_count != 1:
                issues.append(
                    f"Table {table_num} section count is {table_count}, expected 1"
                )

        return issues

    async def _repair_output_structure(
        self,
        report_text: str,
        page_count: int,
        model_client,
        loop: asyncio.AbstractEventLoop,
        status_cb: PipelineStatusCallback | None = None,
    ) -> str:
        """
        Run a structure-repair pass when mandatory page/table sections are missing.
        """
        issues = self._find_output_structure_issues(report_text, page_count)
        if not issues:
            return report_text
        if status_cb is not None:
            await status_cb(
                "gemini_request_started",
                "Gemma response received; finalizing report structure for rendering.",
                {"repair_pass": True, "issue_count": len(issues)},
            )

        repair_system = self._prepare_system_instruction(
            "You are a strict markdown structure normalizer for pharmaceutical BMR audits. "
            "Repair structure only; preserve factual findings from input. "
            "Do not invent new findings. "
            "Return only the corrected final report."
        )
        repair_config = self.fallback_generation_config.model_copy(
            update={"system_instruction": repair_system}
        )

        repair_prompt = (
            f"The report has structure issues for a {page_count}-page audit.\n"
            "Fix ONLY structure and section placement.\n"
            "Mandatory output:\n"
            f"- Exactly page blocks ## PAGE 1 .. ## PAGE {page_count}\n"
            "- Exactly one Reasoning block and one Table block for each Table 1..Table 7\n"
            "- Keep all original findings; only move/format content correctly.\n\n"
            "Detected issues:\n"
            + "\n".join(f"- {issue}" for issue in issues)
            + "\n\nORIGINAL_REPORT:\n"
            + report_text
        )
        try:
            repair_request = self._generate_content_with_resilience(
                model_client=model_client,
                model_id=self.model_id,
                contents=[
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=repair_prompt)],
                    )
                ],
                config=repair_config,
                loop=loop,
            )
            if OUTPUT_REPAIR_TIMEOUT_SECONDS > 0:
                response = await asyncio.wait_for(
                    repair_request,
                    timeout=OUTPUT_REPAIR_TIMEOUT_SECONDS,
                )
            else:
                response = await repair_request
            repaired_text, _ = self._extract_markdown_and_tool_usage(response)
            repaired_text = self._strip_thought_blocks(repaired_text)
        except asyncio.TimeoutError:
            log.warning(
                "Output-structure repair timed out after %.0f seconds; using base response.",
                OUTPUT_REPAIR_TIMEOUT_SECONDS,
            )
            return report_text
        except Exception as exc:
            log.warning("Output-structure repair skipped due to error: %s", exc)
            return report_text

        if not repaired_text.strip():
            return report_text

        remaining_issues = self._find_output_structure_issues(repaired_text, page_count)
        return repaired_text if not remaining_issues else report_text

    async def _handle_function_calls(
        self, function_calls: list
    ) -> tuple[list[types.Part], list[str]]:
        """
        Execute a list of function_call objects via APIVerve and return
        a list of Part.from_function_response objects ready to feed back
        to the model.

        Supported operations: add, subtract, multiply, divide, power, sqrt
        Complex BMR formulas are chained by the model across multiple calls.
        """
        function_response_parts: list[types.Part] = []

        # Supported simple ops that map 1:1 to APIVerve
        SIMPLE_OPS = {"add", "subtract", "multiply", "divide", "power", "sqrt"}
        executed_ops: list[str] = []

        for fc in function_calls:
            func_name = fc.name  # "calculate_math"
            # fc.args is a dict-like object; copy to plain dict
            raw_args = {k: v for k, v in fc.args.items()}
            operation = raw_args.pop("operation", "add")

            if self.emit_calculation_trace:
                log.info(
                    "Executing tool call: %s(args=%s)",
                    func_name, raw_args
                )

            try:
                # ── Route to local math engine ──────────────────────────────────────
                if operation in SIMPLE_OPS:
                    api_result = await math_api_service.calculate(operation, **raw_args)
                elif operation == "evaluate":
                    # Decompose expression into chained simple ops instead
                    expression = raw_args.get("expression", "")
                    api_result = await self._evaluate_expression_via_chain(
                        expression, raw_args
                    )
                else:
                    # Fallback: try calling local math engine directly with whatever op
                    api_result = await math_api_service.calculate(operation, **raw_args)

                log.info(
                    "[local math engine] op=%s args=%s -> result=%s",
                    operation, raw_args, api_result.get('result')
                )
                executed_ops.append(operation)

                function_response_parts.append(
                    types.Part.from_function_response(
                        name=func_name,
                        response={
                            "result": api_result.get("result"),
                            "operation": operation,
                            "input": api_result.get("input", raw_args),
                            "verified_by": "local math engine",
                        },
                    )
                )

            except Exception as api_error:
                log.error("[local math engine] ERROR: op=%s args=%s: %s", operation, raw_args, api_error)
                # Feed the error back so the model can note it in the table
                function_response_parts.append(
                    types.Part.from_function_response(
                        name=func_name,
                        response={
                            "error": str(api_error),
                            "note": "APIVerve calculation failed; compute manually as fallback.",
                        },
                    )
                )

        return function_response_parts, executed_ops

    async def _evaluate_expression_via_chain(self, expression: str, raw_args: dict) -> dict:
        """
        Fallback: if model calls evaluate with an expression string,
        try to parse and decompose it into sequential simple APIVerve calls.
        Common BMR patterns handled:
          (A / B) * 100   → divide(a,b), multiply(result, 100)
          A - B           → subtract(a, b)
          A + B           → add(a, b)
          A * B           → multiply(a, b)
          A / B           → divide(a, b)
        If decomposition fails, perform the calculation with Python's eval
        as a safe-fallback and return a note that it was computed locally.
        """
        import re as _re
        expr = expression.strip()

        try:
            # Pattern: (A / B) * 100  — very common for yield%/accountability%
            m = _re.match(
                r"\(\s*([\d.]+)\s*/\s*([\d.]+)\s*\)\s*\*\s*([\d.]+)", expr
            )
            if m:
                a, b, c = float(m.group(1)), float(m.group(2)), float(m.group(3))
                step1 = await math_api_service.calculate("divide", a=a, b=b)
                r1 = float(step1.get("result", a / b))
                step2 = await math_api_service.calculate("multiply", a=r1, b=c)
                return {
                    "result": step2.get("result"),
                    "steps": [f"{a}/{b}={r1}", f"{r1}*{c}={step2.get('result')}"],
                    "operation": "evaluate",
                    "input": {"expression": expr},
                }

            # Pattern: A - B
            m2 = _re.match(r"([\d.]+)\s*-\s*([\d.]+)", expr)
            if m2:
                a, b = float(m2.group(1)), float(m2.group(2))
                res = await math_api_service.calculate("subtract", a=a, b=b)
                return res

            # Pattern: A + B
            m3 = _re.match(r"([\d.]+)\s*\+\s*([\d.]+)", expr)
            if m3:
                a, b = float(m3.group(1)), float(m3.group(2))
                res = await math_api_service.calculate("add", a=a, b=b)
                return res

            # Pattern: A * B
            m4 = _re.match(r"([\d.]+)\s*\*\s*([\d.]+)", expr)
            if m4:
                a, b = float(m4.group(1)), float(m4.group(2))
                res = await math_api_service.calculate("multiply", a=a, b=b)
                return res

            # Pattern: A / B
            m5 = _re.match(r"([\d.]+)\s*/\s*([\d.]+)", expr)
            if m5:
                a, b = float(m5.group(1)), float(m5.group(2))
                res = await math_api_service.calculate("divide", a=a, b=b)
                return res

            # Safe Python eval fallback (no imports, no builtins)
            safe_result = eval(  # noqa: S307
                expr, {"__builtins__": {}}, {}
            )
            return {
                "result": round(float(safe_result), 6),
                "steps": [f"eval({expr})={safe_result}"],
                "operation": "evaluate",
                "input": {"expression": expr},
                "note": "Computed via local eval fallback",
            }

        except Exception as e:
            return {
                "result": None,
                "error": f"Expression could not be evaluated: {e}",
                "expression": expr,
            }

    # ── PDF helpers ───────────────────────────────────────────────────────

    def get_pdf_page_count(self, file_path: str) -> int:
        try:
            reader = PdfReader(file_path)
            return len(reader.pages)
        except Exception as e:
            log.warning("Error reading PDF page count: %s", e)
            return 1

    def get_file_size_mb(self, file_path: str) -> float:
        return os.path.getsize(file_path) / (1024 * 1024)

    def compress_pdf(self, file_path: str) -> str:
        """
        Compress a PDF if it exceeds PDF_COMPRESSION_TRIGGER_MB.
        Returns the path to use (original or compressed).
        """
        file_size_mb = self.get_file_size_mb(file_path)
        if file_size_mb <= PDF_COMPRESSION_TRIGGER_MB:
            return file_path

        log.info("PDF is %.1f MB — compressing…", file_size_mb)
        try:
            reader = PdfReader(file_path)
            writer = PdfWriter()
            for page_index, page in enumerate(reader.pages):
                writer.add_page(page)
                # pypdf requires the page object to belong to this writer before
                # compress_content_streams can be called.
                try:
                    writer.pages[page_index].compress_content_streams()
                except Exception as page_error:
                    log.debug(
                        "Skipping stream-compression on page %d: %s",
                        page_index + 1,
                        page_error,
                    )
            writer.add_metadata({})

            compressed_path = file_path.replace(".pdf", "_compressed.pdf")
            with open(compressed_path, "wb") as out_file:
                writer.write(out_file)

            compressed_size_mb = self.get_file_size_mb(compressed_path)
            log.info("Compressed: %.1f MB → %.1f MB", file_size_mb, compressed_size_mb)
            if compressed_size_mb >= file_size_mb:
                log.info(
                    "Compression did not reduce size (%.1f MB). Using original.",
                    compressed_size_mb,
                )
                try:
                    os.remove(compressed_path)
                except OSError:
                    pass
                return file_path
            if compressed_size_mb > PDF_COMPRESSION_TRIGGER_MB:
                log.warning(
                    "Warning: compressed file still large (%.1f MB)",
                    compressed_size_mb,
                )

            return compressed_path
        except Exception as e:
            log.error("Compression failed: %s — using original", e)
            return file_path

    async def upload_file(self, file_path: str):
        """Upload a PDF file to the Gemini Files API."""
        model_client = self._require_client()
        loop = asyncio.get_running_loop()
        file = await loop.run_in_executor(
            None,
            lambda: model_client.files.upload(file=file_path),
        )
        return file

    async def run_mistral_ocr(
        self,
        file_path: str,
        status_cb: PipelineStatusCallback | None = None,
    ) -> str:
        """Run Mistral OCR and return per-page markdown text."""
        mistral_api_key = self._require_mistral_api_key()
        with open(file_path, "rb") as src:
            pdf_base64 = base64.b64encode(src.read()).decode("ascii")

        payload = {
            "model": MISTRAL_OCR_MODEL,
            "document": {
                "type": "document_url",
                "document_url": f"data:application/pdf;base64,{pdf_base64}",
            },
            "include_image_base64": False,
        }
        headers = {
            "Authorization": f"Bearer {mistral_api_key}",
            "Content-Type": "application/json",
        }

        if status_cb is not None:
            await status_cb(
                "ocr_request_started",
                "Mistral OCR request started.",
                {"model": MISTRAL_OCR_MODEL},
            )

        log.info("Running Mistral OCR with model=%s", MISTRAL_OCR_MODEL)
        async with httpx.AsyncClient(timeout=240.0) as http_client:
            response = await http_client.post(
                MISTRAL_OCR_ENDPOINT,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            ocr_payload = response.json()

        pages = ocr_payload.get("pages") or []
        if status_cb is not None:
            await status_cb(
                "ocr_response_received",
                "Mistral OCR response received.",
                {"pages": len(pages), "model": ocr_payload.get("model", MISTRAL_OCR_MODEL)},
            )
        page_blocks: list[str] = []
        for page in pages:
            markdown = (page.get("markdown") or "").strip()
            if not markdown:
                continue
            page_index = page.get("index", "?")
            page_blocks.append(f"## OCR PAGE {page_index}\n{markdown}")

        if not page_blocks:
            raise RuntimeError("Mistral OCR returned no markdown pages.")

        ocr_markdown = "\n\n".join(page_blocks)
        if len(ocr_markdown) > OCR_TEXT_MAX_CHARS:
            ocr_markdown = (
                ocr_markdown[:OCR_TEXT_MAX_CHARS]
                + "\n\n[OCR CONTENT TRUNCATED DUE TO SIZE LIMIT]"
            )
        return ocr_markdown

    # ── agentic loop ──────────────────────────────────────────────────────

    @staticmethod
    def _prune_conversation_history(
        contents: list, max_tool_turns: int = MAX_CONVERSATION_HISTORY_TURNS
    ) -> list:
        """
        Prune the conversation history to keep context size manageable.

        Keeps:
          - contents[0]: the original user message (PDF + OCR + brief)
          - The last `max_tool_turns` pairs of (model function_call, user function_response) turns

        This prevents the 500 INTERNAL errors caused by context explosion
        when many math calls accumulate in the conversation.
        """
        if len(contents) <= 1 + (max_tool_turns * 2):
            return contents  # small enough, no pruning needed

        # Always preserve the first content (original user message)
        pruned = [contents[0]]

        # Keep only the last N pairs of (model, user) tool-call turns
        # Each tool-call round adds 2 turns: model (function_call) + user (function_response)
        tool_turns = contents[1:]  # everything after the initial user message
        keep_count = max_tool_turns * 2  # pairs of model + user turns
        if len(tool_turns) > keep_count:
            pruned.extend(tool_turns[-keep_count:])
        else:
            pruned.extend(tool_turns)

        return pruned

    async def _run_agentic_loop(
        self,
        contents: list,
        model_client,
        loop: asyncio.AbstractEventLoop,
        system_instruction: str,
        status_cb: PipelineStatusCallback | None = None,
    ) -> str:
        """
        Run the Gemini + APIVerve agentic loop.

        Each iteration:
          1. Call the model (non-streaming) with current conversation.
          2. If the model returned function calls → execute via APIVerve.
          3. Append model turn + function results to conversation.
          4. Prune old turns if conversation grows too large.
          5. Repeat until no function calls → return the final text response.

        Falls back to no-tool config if the model doesn't support function calling.
        """
        model_id = self._resolve_model_id()
        self.model_id = model_id
        prepared_system_instruction = self._prepare_system_instruction(system_instruction)
        if status_cb is not None:
            await status_cb(
                "gemini_request_started",
                "Gemma request started with PDF + OCR + system-instruction context.",
                {"model": model_id},
            )
        use_fallback = False
        config = self.generation_config.model_copy(
            update={"system_instruction": prepared_system_instruction}
        )
        fallback_config = self.fallback_generation_config.model_copy(
            update={"system_instruction": prepared_system_instruction}
        )
        payload_compacted = False
        total_math_calls = 0
        cumulative_ops: list[str] = []
        math_retry_attempted = False
        numeric_content_detected = self._contents_have_numeric_ocr(contents)

        async def _generate_with_live_updates(
            round_index: int,
            request_contents: list,
            request_config: types.GenerateContentConfig,
        ):
            heartbeat_task: asyncio.Task | None = None

            async def _emit_heartbeat() -> None:
                while True:
                    await asyncio.sleep(8)
                    if status_cb is not None:
                        await status_cb(
                            "gemini_request_started",
                            "Gemma 4 31B is processing the current response.",
                            {
                                "model": model_id,
                                "round": round_index + 1,
                                "heartbeat": True,
                            },
                        )

            if status_cb is not None:
                heartbeat_task = asyncio.create_task(_emit_heartbeat())

            try:
                return await self._generate_content_with_resilience(
                    model_client=model_client,
                    model_id=model_id,
                    contents=request_contents,
                    config=request_config,
                    loop=loop,
                )
            finally:
                if heartbeat_task is not None:
                    heartbeat_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await heartbeat_task

        for round_num in range(MAX_AGENTIC_ROUNDS):
            try:
                if status_cb is not None and round_num > 0:
                    await status_cb(
                        "gemini_request_started",
                        (
                            f"Gemma 4 31B follow-up pass in progress "
                            f"(round {round_num + 1})."
                        ),
                        {"model": model_id, "round": round_num + 1},
                    )
                response = await _generate_with_live_updates(
                    round_index=round_num,
                    request_contents=contents,
                    request_config=config,
                )
            except Exception as tool_error:
                # Special handling: if we get 500 errors after many math calls,
                # conversation history is too large. Switch to no-tool fallback mode
                # which uses a simpler config without tools, reducing request size
                if (
                    total_math_calls >= 5
                    and not use_fallback
                    and self._is_retryable_model_error(tool_error)
                    and not self._is_capacity_error(tool_error)
                ):
                    log.warning(
                        "Model server error after %d math calls (conversation too large); "
                        "switching to no-tool fallback config. Error: %s",
                        total_math_calls,
                        tool_error,
                    )
                    use_fallback = True
                    config = fallback_config
                    contents = self._compact_ocr_text_in_contents(
                        contents, MODEL_SERVER_RETRY_OCR_CHARS
                    )
                    contents = self._condense_contents_for_fallback(
                        contents, total_math_calls
                    )
                    payload_compacted = True
                    if status_cb is not None:
                        await status_cb(
                            "gemini_request_started",
                            "Retrying Gemma with reduced context after upstream model error.",
                            {
                                "model": model_id,
                                "tool_fallback_used": True,
                                "math_calls": total_math_calls,
                            },
                        )
                    continue
                elif not use_fallback and self._is_tool_unavailable_error(tool_error):
                    log.warning(
                        "Function calling unsupported by model — falling back "
                        "to no-tool config. Error: %s", tool_error
                    )
                    use_fallback = True
                    config = fallback_config
                    # Retry this round with fallback config
                    response = await _generate_with_live_updates(
                        round_index=round_num,
                        request_contents=contents,
                        request_config=config,
                    )
                elif (
                    round_num == 0
                    and not payload_compacted
                    and self._is_retryable_model_error(tool_error)
                ):
                    log.warning(
                        "Model server error on first round; retrying with compacted OCR payload. Error: %s",
                        tool_error,
                    )
                    contents = self._compact_ocr_text_in_contents(
                        contents, MODEL_SERVER_RETRY_OCR_CHARS
                    )
                    payload_compacted = True
                    continue
                elif (
                    self._is_retryable_model_error(tool_error)
                    and not use_fallback
                    and not self._is_capacity_error(tool_error)
                ):
                    log.warning(
                        "Model server error with tool config; retrying this round using no-tool fallback. Error: %s",
                        tool_error,
                    )
                    use_fallback = True
                    config = fallback_config
                    contents = self._compact_ocr_text_in_contents(
                        contents, MODEL_SERVER_RETRY_OCR_CHARS
                    )
                    contents = self._condense_contents_for_fallback(
                        contents, total_math_calls
                    )
                    payload_compacted = True
                    if status_cb is not None:
                        await status_cb(
                            "gemini_request_started",
                            "Retrying Gemma with reduced context after upstream model error.",
                            {
                                "model": model_id,
                                "tool_fallback_used": True,
                                "math_calls": total_math_calls,
                            },
                        )
                    continue
                elif self._is_capacity_error(tool_error):
                    if status_cb is not None:
                        await status_cb(
                            "gemini_request_started",
                            (
                                "Gemma API is under high demand right now. "
                                "Please retry in a short while."
                            ),
                            {"model": model_id, "capacity_error": True},
                        )
                    raise RuntimeError(
                        "Gemma API is currently experiencing high demand (503/429). "
                        "Please retry shortly."
                    ) from tool_error
                else:
                    raise

            # Check for function calls in the response
            function_calls = self._extract_function_calls(response)

            if not function_calls:
                # No (more) function calls — extract and return the final text
                if (
                    not use_fallback
                    and numeric_content_detected
                    and total_math_calls == 0
                    and not math_retry_attempted
                ):
                    math_retry_attempted = True
                    contents = list(contents)
                    contents.append(
                        types.Content(
                            role="user",
                            parts=[
                                types.Part.from_text(
                                    text=(
                                        "MANDATORY CORRECTION: Your prior response did not call calculate_math. "
                                        "Re-run the full audit and use calculate_math for every numeric verification. "
                                        "Do not compute inline. Return the complete report again in the exact required structure."
                                    )
                                )
                            ],
                        )
                    )
                    contents = self._prune_conversation_history(contents)
                    continue

                if status_cb is not None:
                    if total_math_calls > 0:
                        await status_cb(
                            "math_calls_executed",
                            f"Math API calls executed: {total_math_calls}.",
                            {"count": total_math_calls, "operations": cumulative_ops},
                        )
                    elif numeric_content_detected:
                        message = (
                            "No math API calls were executed even though numeric content exists."
                            if not use_fallback
                            else "Math API tool unavailable for this run; numeric checks could not be tool-verified."
                        )
                        await status_cb(
                            "math_calls_missing",
                            message,
                            {
                                "count": total_math_calls,
                                "numeric_content_detected": numeric_content_detected,
                                "tool_fallback_used": use_fallback,
                            },
                        )
                    else:
                        await status_cb(
                            "math_calls_not_required",
                            "No numeric operations were detected for math API verification.",
                            {"count": total_math_calls, "numeric_content_detected": False},
                        )

                text, _ = self._extract_markdown_and_tool_usage(response)
                return self._strip_thought_blocks(text)

            # Execute function calls via local math engine
            log.info(
                "[Round %d] Model requested %d "
                "math calculation(s)…", round_num + 1, len(function_calls)
            )
            function_response_parts, executed_ops = await self._handle_function_calls(function_calls)
            total_math_calls += len(executed_ops)
            cumulative_ops.extend(executed_ops)
            if status_cb is not None and executed_ops:
                await status_cb(
                    "math_calls_executed",
                    f"Local math API cumulative calls: {total_math_calls}.",
                    {"count": total_math_calls, "operations": cumulative_ops},
                )
                await status_cb(
                    "gemini_request_started",
                    (
                        "Math verification complete; sending verified tool results "
                        "to Gemma 4 31B for the next response."
                    ),
                    {
                        "model": model_id,
                        "round": round_num + 1,
                        "math_calls": total_math_calls,
                    },
                )
            if (
                total_math_calls >= MATH_CALLS_FORCE_FINALIZE_THRESHOLD
                and not use_fallback
            ):
                use_fallback = True
                config = fallback_config
                contents = self._compact_ocr_text_in_contents(
                    contents, MODEL_SERVER_RETRY_OCR_CHARS
                )
                contents = self._condense_contents_for_fallback(
                    contents, total_math_calls
                )
                payload_compacted = True
                if status_cb is not None:
                    await status_cb(
                        "gemini_request_started",
                        (
                            "Math verification completed; switching to reduced-context "
                            "finalization for a faster final response."
                        ),
                        {
                            "model": model_id,
                            "math_calls": total_math_calls,
                            "tool_fallback_used": True,
                        },
                    )

            # Append model's response (with function_call parts) to conversation
            model_content = self._extract_model_function_call_content(response)
            contents = list(contents)  # copy to avoid mutating caller's list
            if model_content is not None:
                contents.append(model_content)

            # Append function results as a user turn
            contents.append(
                types.Content(role="user", parts=function_response_parts)
            )

            # ── Proactive conversation pruning ──
            # After adding new turns, prune old intermediate function call/response
            # pairs to keep conversation compact. This is the KEY fix for 500 errors.
            pre_prune_len = len(contents)
            contents = self._prune_conversation_history(contents)
            post_prune_len = len(contents)
            if pre_prune_len != post_prune_len:
                log.info(
                    "[Round %d] Pruned conversation: %d → %d turns (kept last %d tool-turn pairs)",
                    round_num + 1, pre_prune_len, post_prune_len,
                    MAX_CONVERSATION_HISTORY_TURNS,
                )

            log.info(
                "[Round %d] Conversation depth: %d turns, %d total math calls executed",
                round_num + 1, len(contents), total_math_calls
            )

            # Brief pause to avoid hammering the API
            await asyncio.sleep(0.05)

        # Exceeded max rounds — return whatever text we can extract from last response
        log.warning("WARNING: Reached max agentic rounds (%d)", MAX_AGENTIC_ROUNDS)
        if status_cb is not None:
            if total_math_calls > 0:
                await status_cb(
                    "math_calls_executed",
                    f"Math API calls executed: {total_math_calls}.",
                    {"count": total_math_calls, "operations": cumulative_ops},
                )
            elif numeric_content_detected:
                await status_cb(
                    "math_calls_missing",
                    "No math API calls were executed even though numeric content exists.",
                    {
                        "count": total_math_calls,
                        "numeric_content_detected": numeric_content_detected,
                        "tool_fallback_used": use_fallback,
                    },
                )
            else:
                await status_cb(
                    "math_calls_not_required",
                    "No numeric operations were detected for math API verification.",
                    {"count": total_math_calls, "numeric_content_detected": False},
                )
        text, _ = self._extract_markdown_and_tool_usage(response)  # type: ignore[possibly-undefined]
        return self._strip_thought_blocks(text)

    # ── public API ────────────────────────────────────────────────────────

    async def process_bmr(
        self,
        file_path: str,
        status_cb: PipelineStatusCallback | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Process a BMR document and yield markdown chunks.

        Flow:
          1. Compress PDF if above configured compression threshold.
          2. Run Mistral OCR and collect page markdown.
          3. Send system instruction + PDF file + OCR context to Gemini.
          4. Run agentic loop:
              - Model generates audit tables.
              - Any `calculate_math` calls → APIVerve → result fed back.
              - Loop until no more function calls.
          5. Filter to markdown tables only (if TABLE_ONLY_OUTPUT).
          6. Yield final result.
        """
        compressed_path = None
        # Create a fresh client for each audit to ensure zero state leakage
        # between independent audit requests
        model_client = self._require_client()

        try:
            # ── file handling ──
            file_size_mb = self.get_file_size_mb(file_path)
            if file_size_mb > MAX_SUPPORTED_UPLOAD_MB:
                raise ValueError(
                    f"PDF size {file_size_mb:.1f} MB exceeds maximum supported "
                    f"size {MAX_SUPPORTED_UPLOAD_MB:.0f} MB."
                )
            if file_size_mb > PDF_COMPRESSION_TRIGGER_MB:
                working_path = self.compress_pdf(file_path)
                if working_path != file_path:
                    compressed_path = working_path
            else:
                working_path = file_path

            page_count = self.get_pdf_page_count(working_path)
            ocr_markdown = await self.run_mistral_ocr(working_path, status_cb=status_cb)

            system_instruction = (
                f"{get_system_instruction(page_count)}\n\n"
                f"{get_audit_prompt(page_count, include_ocr_guidance=True)}"
            )
            user_brief = (
                "Audit this document using the system instruction as the source of truth. "
                "Return only the final markdown report in the required structure."
            )

            uploaded_pdf = await self.upload_file(working_path)
            pdf_part = types.Part.from_uri(
                file_uri=uploaded_pdf.uri,
                mime_type=getattr(uploaded_pdf, "mime_type", "application/pdf"),
            )

            # Build initial multi-turn content list
            contents = self._build_initial_contents(
                user_brief, ocr_markdown, pdf_part=pdf_part
            )
            if status_cb is not None:
                await status_cb(
                    "gemini_payload_prepared",
                    "System instruction, uploaded PDF file, and OCR output are prepared for Gemini.",
                    {"page_count": page_count, "ocr_chars": len(ocr_markdown), "pdf_uri": uploaded_pdf.uri},
                )

            loop = asyncio.get_running_loop()

            # ── agentic loop (Gemini ↔ APIVerve) ──
            response_text = await self._run_agentic_loop(
                contents,
                model_client,
                loop,
                system_instruction=system_instruction,
                status_cb=status_cb,
            )
            raw_response_text = response_text
            response_text = await self._repair_output_structure(
                response_text,
                page_count,
                model_client=model_client,
                loop=loop,
                status_cb=status_cb,
            )
            if status_cb is not None:
                await status_cb(
                    "gemini_response_ready",
                    "Gemma response finalized and ready.",
                    {
                        "response_chars": len(response_text),
                        "repair_applied": response_text != raw_response_text,
                    },
                )
            # ── yield result ──
            if self.table_only_output:
                filtered = self._keep_only_markdown_tables(response_text)
                if filtered:
                    yield filtered
                elif response_text.strip():
                    yield (
                        "| Metric | Value |\n"
                        "|---|---|\n"
                        "| Formatting Notice | Model returned non-table output. "
                        "Retry audit to regenerate table-only report. |\n"
                    )
                else:
                    yield (
                        "| Metric | Value |\n"
                        "|---|---|\n"
                        "| Formatting Notice | Model returned empty output. "
                        "Retry audit. |\n"
                    )
            else:
                if not response_text.strip():
                    response_text = (
                        "| Metric | Value |\n"
                        "|---|---|\n"
                        "| Formatting Notice | Model returned empty output. Retry audit. |\n"
                    )
                yield response_text

        except Exception as e:
            yield f"\n\n**Error during processing:** {str(e)}\n\n"
            raise
        finally:
            if compressed_path and os.path.exists(compressed_path):
                try:
                    os.remove(compressed_path)
                except Exception:
                    pass

    async def process_bmr_simple(self, file_path: str) -> str:
        """
        Non-streaming version of process_bmr.
        Runs the full agentic loop and returns the complete markdown result.
        """
        compressed_path = None
        # Fresh client for each audit — zero state leakage
        model_client = self._require_client()

        try:
            file_size_mb = self.get_file_size_mb(file_path)
            if file_size_mb > MAX_SUPPORTED_UPLOAD_MB:
                raise ValueError(
                    f"PDF size {file_size_mb:.1f} MB exceeds maximum supported "
                    f"size {MAX_SUPPORTED_UPLOAD_MB:.0f} MB."
                )
            if file_size_mb > PDF_COMPRESSION_TRIGGER_MB:
                working_path = self.compress_pdf(file_path)
                if working_path != file_path:
                    compressed_path = working_path
            else:
                working_path = file_path

            page_count = self.get_pdf_page_count(working_path)
            ocr_markdown = await self.run_mistral_ocr(working_path)

            system_instruction = (
                f"{get_system_instruction(page_count)}\n\n"
                f"{get_audit_prompt(page_count, include_ocr_guidance=True)}"
            )
            user_brief = (
                "Audit this document using the system instruction as the source of truth. "
                "Return only the final markdown report in the required structure."
            )

            uploaded_pdf = await self.upload_file(working_path)
            pdf_part = types.Part.from_uri(
                file_uri=uploaded_pdf.uri,
                mime_type=getattr(uploaded_pdf, "mime_type", "application/pdf"),
            )
            contents = self._build_initial_contents(
                user_brief, ocr_markdown, pdf_part=pdf_part
            )

            loop = asyncio.get_running_loop()
            response_text = await self._run_agentic_loop(
                contents,
                model_client,
                loop,
                system_instruction=system_instruction,
            )
            response_text = await self._repair_output_structure(
                response_text,
                page_count,
                model_client=model_client,
                loop=loop,
            )
            if self.table_only_output:
                filtered = self._keep_only_markdown_tables(response_text)
                if filtered:
                    return filtered
                return (
                    "| Metric | Value |\n"
                    "|---|---|\n"
                    "| Formatting Notice | Model returned non-table output. "
                    "Retry audit to regenerate table-only report. |\n"
                )
            return response_text

        finally:
            if compressed_path and os.path.exists(compressed_path):
                try:
                    os.remove(compressed_path)
                except Exception:
                    pass


# ── Singleton ─────────────────────────────────────────────────────────────────
audit_service = GemmaAuditService()
