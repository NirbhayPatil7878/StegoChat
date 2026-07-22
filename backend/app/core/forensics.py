"""Lightweight image forensics: entropy, LSB anomaly and risk scoring.

Used both to guard uploads and to power the "Forensic Analyzer" UI feature.
It is heuristic, not a guarantee — it flags images that *look* like they may
carry hidden data or be malformed.
"""

from __future__ import annotations

from io import BytesIO

import numpy as np
from PIL import Image, UnidentifiedImageError

from app.core.eof import EOF_MARKER


def _shannon_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = np.bincount(np.frombuffer(data, dtype=np.uint8), minlength=256)
    probs = counts[counts > 0] / len(data)
    return float(-np.sum(probs * np.log2(probs)))


def analyze(raw: bytes, filename: str = "") -> dict:
    reasons: list[str] = []
    malformed = False
    info: dict = {"width": None, "height": None, "mode": None, "format": None}
    anomaly_score = 0.0
    lsb_density = 0.0

    try:
        probe = Image.open(BytesIO(raw))
        probe.verify()
        img = Image.open(BytesIO(raw)).convert("RGB")
        info = {"width": img.width, "height": img.height, "mode": "RGB", "format": probe.format}
        arr = np.asarray(img, dtype=np.uint8).reshape(-1)
        sample = arr[: min(arr.size, 300_000)]
        lsb = sample & 1
        lsb_density = float(lsb.mean())
        # Natural images have LSB density near 0.5; heavy embedding skews it
        # or makes it *too* uniform. We measure deviation from 0.5.
        anomaly_score = round(abs(lsb_density - 0.5) * 200, 2)
    except (UnidentifiedImageError, OSError, ValueError):
        malformed = True
        anomaly_score = 100.0
        reasons.append("Malformed or unreadable image")

    entropy = round(_shannon_entropy(raw[: min(len(raw), 65_536)]), 3)
    if entropy > 7.9:
        reasons.append("Very high entropy — may contain encrypted/embedded data")
    if anomaly_score > 18 and not malformed:
        reasons.append("Elevated LSB anomaly score — possible steganography")
    if EOF_MARKER in raw:
        reasons.append("Contains a StegoChat appended-payload marker")
    if len(raw) > 8 * 1024 * 1024:
        reasons.append("Large payload for an image")

    if malformed or len(reasons) >= 2:
        level = "suspicious"
    elif reasons:
        level = "risky"
    else:
        level = "safe"

    return {
        "level": level,
        "malformed": malformed,
        "reasons": reasons,
        "entropy": entropy,
        "lsb_anomaly_score": anomaly_score,
        "lsb_density": round(lsb_density, 4),
        "size_bytes": len(raw),
        "image": info,
    }


# --- Message risk scanning ---------------------------------------------------

import re  # noqa: E402

_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bpassword\b", re.I), "Mentions a password"),
    (re.compile(r"\botp\b|\bone[- ]?time\b|verification code", re.I), "Looks like an OTP"),
    (re.compile(r"\b\d{4,8}\b"), "Contains a numeric PIN/code"),
    (
        re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),
        "Contains an email address",
    ),
    (re.compile(r"\bsk_[A-Za-z0-9]{16,}\b"), "Contains an API secret key"),
    (re.compile(r"\b0x[a-fA-F0-9]{40}\b"), "Contains a crypto wallet address"),
    (re.compile(r"\b[A-Fa-f0-9]{32,}\b"), "Contains a long token/hash"),
]


def scan_message_risk(message: str) -> dict:
    findings = list(dict.fromkeys(label for pat, label in _PATTERNS if pat.search(message)))
    high = any(k in " ".join(findings).lower() for k in ("secret", "token", "wallet"))
    level = "suspicious" if high else "risky" if findings else "safe"
    return {"level": level, "findings": findings, "should_hide": bool(findings)}
