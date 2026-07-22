"""Shared slowapi limiter instance keyed by client IP."""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# headers_enabled is left off: injecting rate-limit headers requires every
# decorated endpoint to expose a `response: Response` param. Enforcement still
# works; we simply don't advertise the remaining quota in response headers.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default],
)
