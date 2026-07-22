"""StegoChat FastAPI application entry point."""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.rate_limit import limiter
from app.database import engine, init_db
from app.logging_config import configure_logging
from app.routers import (
    auth,
    conversations,
    dashboard,
    dead_drop,
    files,
    history,
    share_tokens,
    stego,
    users,
)
from app.services.storage import ensure_dirs

logger = logging.getLogger("stegochat")

# Build metadata, surfaced on /api/health for deploy verification and dashboards.
# STEGOCHAT_GIT_SHA is injected at image-build time (see backend/Dockerfile).
GIT_SHA = os.getenv("STEGOCHAT_GIT_SHA", "unknown")
_START_TIME = time.monotonic()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging(settings.debug)
    ensure_dirs()
    init_db()
    logger.info(
        "StegoChat API ready — env=%s db=%s",
        settings.environment,
        "sqlite" if settings.is_sqlite else "external",
    )
    yield
    logger.info("StegoChat API shutting down")


app = FastAPI(
    title="StegoChat API",
    description="Secure steganographic messaging — hide AES-256 encrypted messages inside images.",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# --- Rate limiting -----------------------------------------------------------
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Too many requests — slow down and try again shortly."},
    )


# --- Security headers --------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        if settings.environment == "production":
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response


app.add_middleware(SecurityHeadersMiddleware)

# --- CORS --------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


# --- Uniform error envelope --------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "Validation error", "errors": exc.errors()},
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# --- Routers -----------------------------------------------------------------
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(stego.router)
app.include_router(history.router)
app.include_router(dashboard.router)
app.include_router(dead_drop.router)
app.include_router(share_tokens.router)
app.include_router(conversations.router)
app.include_router(files.router)


@app.get("/api/health", tags=["meta"])
def health():
    """Liveness + build metadata. Cheap; never touches the database."""
    return {
        "status": "ok",
        "service": "stegochat",
        "version": app.version,
        "commit": GIT_SHA,
        "environment": settings.environment,
        "uptime_seconds": round(time.monotonic() - _START_TIME, 1),
    }


@app.get("/api/ready", tags=["meta"])
def ready(response: Response):
    """Readiness probe: verifies the database is reachable.

    Returns 503 when a dependency is down so orchestrators (k8s, compose
    healthchecks, load balancers) stop routing traffic to this instance.
    """
    checks: dict[str, str] = {}
    healthy = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 - report any failure as not-ready
        logger.warning("Readiness check failed: database unreachable: %s", exc)
        checks["database"] = "unavailable"
        healthy = False

    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ready" if healthy else "not_ready", "checks": checks}


@app.get("/", tags=["meta"])
def root():
    return {
        "service": "StegoChat API",
        "docs": "/api/docs",
        "health": "/api/health",
        "ready": "/api/ready",
    }
