"""Compromised-password check via the HaveIBeenPwned range API (k-anonymity).

Only the first 5 hex chars of the password's SHA-1 are ever sent to HIBP; the
API returns every suffix sharing that prefix and we match locally. The full
password (or its full hash) never leaves this process.

Uses the standard library only, so nothing is added to the production runtime
dependencies. Fails open: if HIBP is unreachable we allow the password rather
than block registration on a third-party outage.
"""

from __future__ import annotations

import hashlib
import logging
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger("stegochat")

_HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/"
# Returned when the service is unreachable (fail-open sentinel).
UNKNOWN = -1


def pwned_count(password: str, *, timeout: float = 3.0) -> int:
    """Return how many breaches this password appears in.

    ``0`` means not found; a positive number is the breach count; ``UNKNOWN``
    (-1) means the check could not be performed (treated as allowed upstream).
    """
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()  # noqa: S324
    prefix, suffix = sha1[:5], sha1[5:]
    req = Request(  # noqa: S310 - fixed https host
        _HIBP_RANGE_URL + prefix,
        headers={"User-Agent": "StegoChat", "Add-Padding": "true"},
    )
    try:
        with urlopen(req, timeout=timeout) as resp:  # noqa: S310
            body = resp.read().decode("utf-8")
    except (URLError, TimeoutError, OSError) as exc:
        logger.warning("HIBP check unavailable, failing open: %s", exc)
        return UNKNOWN

    for line in body.splitlines():
        candidate, _, count = line.partition(":")
        if candidate.strip().upper() == suffix:
            try:
                return int(count.strip() or 0)
            except ValueError:
                return UNKNOWN
    return 0


def guard_password(password: str) -> None:
    """Raise 422 if the password is known-breached (when the check is enabled)."""
    if not settings.pwned_check_enabled:
        return
    count = pwned_count(password)
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This password has appeared in known data breaches "
                f"({count:,} times). Please choose a different one."
            ),
        )
