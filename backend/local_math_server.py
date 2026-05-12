"""
Local Math Calculation Server — BMR Audit System.

Runs on http://127.0.0.1:8001 as a background service embedded inside the
main application process.  Completely replaces the external APIVerve API.

Architecture
────────────
• Pure-Python math engine (no external dependencies beyond stdlib + FastAPI).
• Safe AST-based expression evaluator — no eval(), no exec(), no imports
  inside expressions. Only numeric literals, +, -, *, /, **, %, unary −,
  and whitelisted math functions (sqrt, abs, round, log, …) are allowed.
• Returns the same JSON envelope the rest of the codebase expects:
    { "status": "ok", "data": { "result": <float>, "operation": ...,
                                "input": {...}, "steps": [...],
                                "computed_by": "local_python" } }
• Every request/response is written to the "local_math" logger so you can
  watch all calculations in real-time in the uvicorn console.

Endpoints
─────────
  GET  /math/health       — liveness probe
  POST /math/calculate    — single operation (add/subtract/multiply/divide/
                            power/sqrt/evaluate/abs/round/percentage/chain)
  GET  /math/ops          — list all supported operations
"""

import ast
import math as _math
import operator as _operator
import logging
import time
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

# ─── Logger ──────────────────────────────────────────────────────────────────
log = logging.getLogger("local_math")

# ─── FastAPI app ──────────────────────────────────────────────────────────────
math_app = FastAPI(
    title="BMR Local Math Calculator",
    description=(
        "Zero-dependency local math engine for BMR numerical verification. "
        "Supports BODMAS expressions, all arithmetic ops, and BMR-specific "
        "formulas (Yield%, Accountability%, Weight Balance, Friability%, etc.)."
    ),
    version="1.0.0",
    docs_url="/math/docs",
    redoc_url=None,
)

# ─── Safe AST evaluator ───────────────────────────────────────────────────────
# Only these node types and functions are allowed; everything else raises
# ValueError so user-supplied expressions can never execute arbitrary code.

_BINARY_OPS = {
    ast.Add:  _operator.add,
    ast.Sub:  _operator.sub,
    ast.Mult: _operator.mul,
    ast.Div:  _operator.truediv,
    ast.Pow:  _operator.pow,
    ast.Mod:  _operator.mod,
    ast.FloorDiv: _operator.floordiv,
}

_UNARY_OPS = {
    ast.USub: _operator.neg,
    ast.UAdd: _operator.pos,
}

_SAFE_FUNCTIONS: dict = {
    "sqrt":   _math.sqrt,
    "abs":    abs,
    "round":  round,
    "log":    _math.log,
    "log10":  _math.log10,
    "log2":   _math.log2,
    "exp":    _math.exp,
    "floor":  _math.floor,
    "ceil":   _math.ceil,
    "sin":    _math.sin,
    "cos":    _math.cos,
    "tan":    _math.tan,
    "pow":    pow,
    "min":    min,
    "max":    max,
}


def _eval_node(node) -> float:
    """Recursively evaluate a safe AST node."""
    # Numeric literal (Python 3.8+)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return float(node.value)
        raise ValueError(f"Non-numeric constant not allowed: {node.value!r}")

    # Binary op: a + b, a - b, a * b, a / b, a ** b, a % b
    if isinstance(node, ast.BinOp):
        op_fn = _BINARY_OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported binary operator: {type(node.op).__name__}")
        left  = _eval_node(node.left)
        right = _eval_node(node.right)
        if isinstance(node.op, ast.Div) and right == 0:
            raise ValueError("Division by zero in expression")
        return op_fn(left, right)

    # Unary op: -x, +x
    if isinstance(node, ast.UnaryOp):
        op_fn = _UNARY_OPS.get(type(node.op))
        if op_fn is None:
            raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
        return op_fn(_eval_node(node.operand))

    # Function call: sqrt(x), abs(x), round(x, 2), …
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            fn = _SAFE_FUNCTIONS.get(node.func.id)
            if fn is not None:
                args = [_eval_node(arg) for arg in node.args]
                return float(fn(*args))
            raise ValueError(f"Function not allowed: {node.func.id}()")
        raise ValueError(f"Complex function call not allowed: {ast.dump(node.func)}")

    raise ValueError(f"Unsupported expression element: {type(node).__name__}")


def safe_evaluate(expression: str) -> float:
    """
    Parse and evaluate a BODMAS math expression safely using AST.

    Examples:
        safe_evaluate("(98.5 - 2.1) / 99.7 * 100")  → 97.28…
        safe_evaluate("sqrt(49)")                     → 7.0
        safe_evaluate("round(97.76, 1)")              → 97.8

    Raises ValueError for any unsafe or invalid expression.
    """
    try:
        tree = ast.parse(expression.strip(), mode="eval")
    except SyntaxError as e:
        raise ValueError(f"Syntax error in expression: {e}")

    return _eval_node(tree.body)


# ─── Pydantic request model ───────────────────────────────────────────────────

class CalcRequest(BaseModel):
    operation:  str
    a:          Optional[float] = None
    b:          Optional[float] = None
    number:     Optional[float] = None
    expression: Optional[str]  = None
    # For chain operations: list of {"op", "a", "b"} dicts
    chain:      Optional[list] = None

    @field_validator("operation")
    @classmethod
    def op_must_be_string(cls, v):
        return v.strip().lower()


# ─── Response builder ────────────────────────────────────────────────────────

def _ok(result: float, operation: str, input_data: dict, steps: list[str]) -> dict:
    return {
        "status": "ok",
        "error": None,
        "data": {
            "result":      round(result, 10),
            "operation":   operation,
            "input":       input_data,
            "steps":       steps,
            "computed_by": "local_python",
        },
    }


def _err(message: str, operation: str = "") -> dict:
    return {
        "status": "error",
        "error":  message,
        "data":   None,
    }


# ─── Middleware — request timer ───────────────────────────────────────────────

@math_app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    if request.url.path != "/math/health":
        log.debug(
            "HTTP %s %s -> %s  [%.1f ms]",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response


# ─── Endpoints ───────────────────────────────────────────────────────────────

@math_app.get("/math/health")
async def health():
    """Liveness probe — returns immediately without logging."""
    return {"status": "ok", "service": "BMR Local Math Calculator", "version": "1.0.0"}


@math_app.get("/math/ops")
async def list_ops():
    """List all supported operations and their required parameters."""
    return {
        "operations": {
            "add":        {"params": ["a", "b"],          "example": {"a": 10, "b": 5}},
            "subtract":   {"params": ["a", "b"],          "example": {"a": 100, "b": 2.1}},
            "multiply":   {"params": ["a", "b"],          "example": {"a": 0.985, "b": 100}},
            "divide":     {"params": ["a", "b"],          "example": {"a": 98.5, "b": 99.7}},
            "power":      {"params": ["a", "b"],          "example": {"a": 2, "b": 10}},
            "sqrt":       {"params": ["number"],          "example": {"number": 49}},
            "abs":        {"params": ["number"],          "example": {"number": -3.5}},
            "round":      {"params": ["number", "b"],     "example": {"number": 97.76, "b": 1}},
            "percentage": {"params": ["a", "b"],          "example": {"a": 98.5, "b": 100},
                           "note": "(a / b) * 100"},
            "evaluate":   {"params": ["expression"],      "example": {"expression": "(98.5 - 2.1) / 99.7 * 100"}},
            "chain":      {"params": ["chain"],           "example": {
                               "chain": [
                                   {"op": "divide",   "a": 98.5, "b": 99.7},
                                   {"op": "multiply", "a": "__prev__", "b": 100}
                               ]
                           }},
        }
    }


@math_app.post("/math/calculate")
async def calculate(req: CalcRequest):
    """
    Perform a math calculation and return a verified result with step trace.

    Supported operations:
      add, subtract, multiply, divide, power, sqrt, abs, round,
      percentage (= (a/b)*100), evaluate (full BODMAS expression),
      chain (sequential multi-step operations).
    """
    op = req.operation
    log.info(
        "CALC  op=%-12s  a=%-10s  b=%-10s  num=%-10s  expr=%s",
        op,
        req.a if req.a is not None else "-",
        req.b if req.b is not None else "-",
        req.number if req.number is not None else "-",
        f'"{req.expression}"' if req.expression else "-",
    )

    t0 = time.perf_counter()

    try:
        # ── add ──────────────────────────────────────────────────────────────
        if op == "add":
            if req.a is None or req.b is None:
                return JSONResponse(_err("'add' requires a and b"), status_code=400)
            result = req.a + req.b
            resp = _ok(result, op, {"a": req.a, "b": req.b},
                       [f"{req.a} + {req.b} = {result}"])

        # ── subtract ─────────────────────────────────────────────────────────
        elif op == "subtract":
            if req.a is None or req.b is None:
                return JSONResponse(_err("'subtract' requires a and b"), status_code=400)
            result = req.a - req.b
            resp = _ok(result, op, {"a": req.a, "b": req.b},
                       [f"{req.a} - {req.b} = {result}"])

        # ── multiply ─────────────────────────────────────────────────────────
        elif op == "multiply":
            if req.a is None or req.b is None:
                return JSONResponse(_err("'multiply' requires a and b"), status_code=400)
            result = req.a * req.b
            resp = _ok(result, op, {"a": req.a, "b": req.b},
                       [f"{req.a} × {req.b} = {result}"])

        # ── divide ───────────────────────────────────────────────────────────
        elif op == "divide":
            if req.a is None or req.b is None:
                return JSONResponse(_err("'divide' requires a and b"), status_code=400)
            if req.b == 0:
                return JSONResponse(_err("Division by zero"), status_code=400)
            result = req.a / req.b
            resp = _ok(result, op, {"a": req.a, "b": req.b},
                       [f"{req.a} ÷ {req.b} = {result}"])

        # ── power ────────────────────────────────────────────────────────────
        elif op == "power":
            if req.a is None or req.b is None:
                return JSONResponse(_err("'power' requires a and b"), status_code=400)
            result = req.a ** req.b
            resp = _ok(result, op, {"a": req.a, "b": req.b},
                       [f"{req.a} ^ {req.b} = {result}"])

        # ── sqrt ─────────────────────────────────────────────────────────────
        elif op == "sqrt":
            num = req.number if req.number is not None else req.a
            if num is None:
                return JSONResponse(_err("'sqrt' requires 'number' param"), status_code=400)
            if num < 0:
                return JSONResponse(_err(f"sqrt({num}) is undefined for negatives"), status_code=400)
            result = _math.sqrt(num)
            resp = _ok(result, op, {"number": num}, [f"sqrt({num}) = {result}"])

        # ── abs ──────────────────────────────────────────────────────────────
        elif op == "abs":
            num = req.number if req.number is not None else req.a
            if num is None:
                return JSONResponse(_err("'abs' requires 'number' param"), status_code=400)
            result = abs(num)
            resp = _ok(result, op, {"number": num}, [f"|{num}| = {result}"])

        # ── round ────────────────────────────────────────────────────────────
        elif op == "round":
            num = req.number if req.number is not None else req.a
            if num is None:
                return JSONResponse(_err("'round' requires 'number' param"), status_code=400)
            ndigits = int(req.b) if req.b is not None else 2
            result = round(num, ndigits)
            resp = _ok(result, op, {"number": num, "digits": ndigits},
                       [f"round({num}, {ndigits}) = {result}"])

        # ── percentage: (a / b) * 100 ─────────────────────────────────────
        elif op == "percentage":
            if req.a is None or req.b is None:
                return JSONResponse(_err("'percentage' requires a (numerator) and b (denominator)"), status_code=400)
            if req.b == 0:
                return JSONResponse(_err("Division by zero in percentage"), status_code=400)
            ratio  = req.a / req.b
            result = ratio * 100
            resp = _ok(result, op, {"a": req.a, "b": req.b}, [
                f"Step 1: {req.a} ÷ {req.b} = {ratio}",
                f"Step 2: {ratio} × 100 = {result}",
            ])

        # ── evaluate: full BODMAS expression string ───────────────────────
        elif op == "evaluate":
            expr = (req.expression or "").strip()
            if not expr:
                return JSONResponse(_err("'evaluate' requires an 'expression' string"), status_code=400)
            result = safe_evaluate(expr)
            result = round(result, 10)
            resp = _ok(result, op, {"expression": expr},
                       [f"BODMAS({expr}) = {result}"])

        # ── chain: sequential multi-step operations ───────────────────────
        elif op == "chain":
            if not req.chain:
                return JSONResponse(_err("'chain' requires a non-empty 'chain' list"), status_code=400)
            steps = []
            prev  = None
            for i, step_def in enumerate(req.chain):
                step_op = step_def.get("op", "").strip().lower()
                a_val   = step_def.get("a")
                b_val   = step_def.get("b")

                # __prev__ token: substitute result of previous step
                if a_val == "__prev__":
                    a_val = prev
                if b_val == "__prev__":
                    b_val = prev

                if step_op == "add":        step_result = a_val + b_val
                elif step_op == "subtract": step_result = a_val - b_val
                elif step_op == "multiply": step_result = a_val * b_val
                elif step_op == "divide":
                    if b_val == 0:
                        return JSONResponse(_err(f"Chain step {i+1}: division by zero"), status_code=400)
                    step_result = a_val / b_val
                elif step_op == "power":    step_result = a_val ** b_val
                elif step_op == "sqrt":
                    n = a_val if a_val is not None else step_def.get("number")
                    step_result = _math.sqrt(n)
                elif step_op == "abs":
                    n = a_val if a_val is not None else step_def.get("number")
                    step_result = abs(n)
                else:
                    return JSONResponse(_err(f"Chain step {i+1}: unknown op '{step_op}'"), status_code=400)

                steps.append(f"Step {i+1} ({step_op}): {a_val} op {b_val} = {step_result}")
                prev = step_result
                result = step_result

            resp = _ok(result, op, {"chain": req.chain}, steps)

        else:
            return JSONResponse(
                _err(f"Unknown operation: '{op}'. See GET /math/ops for supported ops."),
                status_code=400,
            )

        elapsed_ms = (time.perf_counter() - t0) * 1000
        log.info(
            "RESULT op=%-12s  result=%-15s  [%.2f ms]",
            op,
            resp["data"]["result"],
            elapsed_ms,
        )
        return JSONResponse(resp)

    except ValueError as exc:
        log.warning("CALC ERROR op=%s  error=%s", op, exc)
        return JSONResponse(_err(str(exc), op), status_code=400)
    except Exception as exc:
        log.exception("CALC UNEXPECTED ERROR op=%s", op)
        return JSONResponse(_err(f"Internal error: {exc}", op), status_code=500)
