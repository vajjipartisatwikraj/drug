"""
Local Math API Service — BMR Audit System.

Replaces APIVerve entirely.  All calculations are routed to the local
math server running on http://127.0.0.1:8001 (started by main.py).

The interface is intentionally identical to the old MathAPIService so
gemini_service.py needs zero changes.
"""

import httpx
import asyncio
import logging
import time
from typing import Any

# ─── Logger ──────────────────────────────────────────────────────────────────
log = logging.getLogger("math_client")

# ─── Local math server config ─────────────────────────────────────────────────
LOCAL_MATH_BASE = "http://127.0.0.1:8001"
LOCAL_MATH_CALC = f"{LOCAL_MATH_BASE}/math/calculate"
LOCAL_MATH_HEALTH = f"{LOCAL_MATH_BASE}/math/health"

# Operations the local server supports directly
ALL_OPS = {
    "add", "subtract", "multiply", "divide", "power",
    "sqrt", "abs", "round", "percentage", "evaluate", "chain",
}


class LocalMathService:
    """
    Async HTTP client for the local math calculation server.

    Drop-in replacement for the old APIVerve MathAPIService.
    All public methods keep the same signature for zero-impact migration.
    """

    def __init__(self) -> None:
        # Reusable async client; created lazily in each call to avoid
        # event-loop issues across uvicorn reload cycles.
        self._base = LOCAL_MATH_BASE
        log.info(
            "LocalMathService initialised — math server: %s", self._base
        )

    # ── Connection test ────────────────────────────────────────────────────

    async def test_connection(self) -> dict:
        """
        Verify the local math server is reachable and returns correct results.

        Returns dict with keys: working, status_code, message, test_result.
        """
        log.info("Testing local math server connection…")
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(LOCAL_MATH_HEALTH)

            if resp.status_code != 200:
                return {
                    "working": False,
                    "status_code": resp.status_code,
                    "message": f"Health check returned {resp.status_code}",
                    "test_result": None,
                }

            # Run a real arithmetic test: 10 + 5 = 15
            async with httpx.AsyncClient(timeout=5.0) as client:
                calc = await client.post(
                    LOCAL_MATH_CALC,
                    json={"operation": "add", "a": 10, "b": 5},
                )
            data = calc.json()
            result_val = data.get("data", {}).get("result")

            ok = calc.status_code == 200 and result_val == 15.0
            log.info(
                "Math server test: %s  (10+5=%s)",
                "PASS" if ok else "FAIL",
                result_val,
            )
            return {
                "working": ok,
                "status_code": calc.status_code,
                "message": (
                    f"Local math server OK. Test: 10 + 5 = {result_val}"
                    if ok
                    else f"Unexpected result: {result_val}"
                ),
                "test_result": data.get("data"),
            }

        except httpx.ConnectError:
            msg = (
                "Local math server not reachable at "
                f"{LOCAL_MATH_HEALTH}. Is main.py running?"
            )
            log.error(msg)
            return {"working": False, "status_code": None,
                    "message": msg, "test_result": None}
        except Exception as exc:
            log.exception("Unexpected error testing math server")
            return {"working": False, "status_code": None,
                    "message": str(exc), "test_result": None}

    # ── Main calculation call ──────────────────────────────────────────────

    async def calculate(self, operation: str, **kwargs: Any) -> dict:
        """
        Call the local math server for a single operation.

        Args:
            operation : One of ALL_OPS (add, subtract, multiply, divide,
                        power, sqrt, abs, round, percentage, evaluate, chain).
            **kwargs  : Operation-specific parameters (a, b, number,
                        expression, chain).

        Returns:
            dict with keys: result, operation, input, steps, computed_by.

        Raises:
            ValueError  on calculation error or server error.
            RuntimeError if the math server is unreachable.
        """
        payload: dict = {
            "operation": operation,
            **{k: v for k, v in kwargs.items() if v is not None},
        }

        log.info(
            "MATH CALL  op=%-12s  params=%s",
            operation,
            {k: v for k, v in kwargs.items() if v is not None},
        )
        t0 = time.perf_counter()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(LOCAL_MATH_CALC, json=payload)

            elapsed_ms = (time.perf_counter() - t0) * 1000

            if resp.status_code == 200:
                body = resp.json()
                if body.get("status") == "ok":
                    data = body.get("data", body)
                    log.info(
                        "MATH RESULT op=%-12s  result=%-15s  steps=%s  [%.1f ms]",
                        operation,
                        data.get("result"),
                        data.get("steps", []),
                        elapsed_ms,
                    )
                    return data
                else:
                    error_msg = body.get("error", "Unknown error from math server")
                    log.warning(
                        "MATH CALC ERROR op=%s  error=%s  [%.1f ms]",
                        operation, error_msg, elapsed_ms,
                    )
                    raise ValueError(f"Math server error: {error_msg}")

            elif resp.status_code == 400:
                body = resp.json()
                msg = body.get("error", resp.text[:200])
                log.warning("MATH BAD REQUEST op=%s  msg=%s", operation, msg)
                raise ValueError(f"Bad calculation request: {msg}")

            else:
                log.error(
                    "MATH SERVER HTTP ERROR op=%s  status=%s  body=%s",
                    operation, resp.status_code, resp.text[:200],
                )
                raise ValueError(
                    f"Math server returned HTTP {resp.status_code}: {resp.text[:200]}"
                )

        except httpx.ConnectError:
            log.error(
                "MATH SERVER UNREACHABLE op=%s — is main.py running?", operation
            )
            raise RuntimeError(
                f"Local math server unreachable at {self._base}. "
                "Check that the main backend is running."
            )
        except httpx.TimeoutException:
            log.error("MATH SERVER TIMEOUT op=%s", operation)
            raise ValueError(
                f"Local math server timed out on operation '{operation}'."
            )
        except (ValueError, RuntimeError):
            raise
        except Exception as exc:
            log.exception("MATH UNEXPECTED ERROR op=%s", operation)
            raise ValueError(f"Unexpected math error: {exc}") from exc

    # ── Convenience shortcuts ──────────────────────────────────────────────

    async def evaluate_expression(self, expression: str) -> dict:
        """Shortcut: evaluate a full BODMAS expression string."""
        return await self.calculate("evaluate", expression=expression)

    async def percentage(self, numerator: float, denominator: float) -> dict:
        """Shortcut: compute (numerator / denominator) * 100."""
        return await self.calculate("percentage", a=numerator, b=denominator)

    def format_result_for_audit(self, calc_result: dict) -> str:
        """
        Format a calc result into a compact string the model can use
        to fill in table cells.
        """
        result    = calc_result.get("result", "N/A")
        operation = calc_result.get("operation", "")
        steps     = calc_result.get("steps", [])
        inp       = calc_result.get("input", {})

        parts = [f"LocalMath result: {result}"]
        if steps:
            parts.append(f"Steps: {' → '.join(str(s) for s in steps)}")
        if inp:
            parts.append(f"Input: {inp}")
        if operation:
            parts.append(f"Op: {operation}")

        return " | ".join(parts)


# ─── Singleton ────────────────────────────────────────────────────────────────
math_api_service = LocalMathService()
