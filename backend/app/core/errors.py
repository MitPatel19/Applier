"""Friendly, structured API errors.

Every error response has the shape::

    {"error": {"code": str, "message": str, "retryable": bool, "details": Any | None}}

``message`` is always safe to show to end users. Technical detail never leaks from
unhandled exceptions; it is logged server-side instead.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("applier")


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None,
                 retryable: bool = False, details: Any = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.retryable = retryable
        self.details = details


class NotFound(AppError):
    status_code = 404
    code = "not_found"

    def __init__(self, what: str = "item"):
        super().__init__(f"We couldn't find that {what}. It may have been removed.")


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


def _body(code: str, message: str, retryable: bool = False, details: Any = None) -> dict:
    return {"error": {"code": code, "message": message, "retryable": retryable, "details": details}}


_STATUS_MESSAGES = {
    401: ("unauthorized", "Please sign in to continue."),
    403: ("forbidden", "You don't have permission to do that."),
    404: ("not_found", "We couldn't find what you were looking for."),
    405: ("method_not_allowed", "That action isn't supported here."),
    429: ("rate_limited", "You're going a little fast. Please wait a moment and try again."),
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code,
                            content=_body(exc.code, exc.message, exc.retryable, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        fields = []
        for err in exc.errors():
            loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
            fields.append({"field": ".".join(loc), "message": err.get("msg", "Invalid value")})
        return JSONResponse(status_code=422, content=_body(
            "validation_error", "Some information needs attention before we can continue.", False, fields))

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        code, default = _STATUS_MESSAGES.get(exc.status_code, ("error", "Something went wrong."))
        message = exc.detail if isinstance(exc.detail, str) and exc.status_code < 500 else default
        return JSONResponse(status_code=exc.status_code, content=_body(code, message, exc.status_code >= 500))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content=_body(
            "internal_error",
            "Something went wrong on our side. Your data is safe — please try again in a moment.",
            True,
        ))
