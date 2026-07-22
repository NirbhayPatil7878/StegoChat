"""Image steganography — five embedding methods.

Methods
-------
lsb      : 1 LSB per pixel, blue channel, password-permuted. (default, backward-compatible)
lsb-rgb  : 1 LSB per channel across R+G+B, 3× capacity.
lsb-2bit : 2 LSBs per pixel, blue channel, 2× capacity.
pvd      : Pixel Value Differencing — encodes in pair differences.
dct      : Modifies mid-frequency DCT coefficients in 8×8 pixel blocks.

All methods encrypt the payload with AES-256-GCM before embedding, so the
pixels carry only ciphertext. Extract tries every method until one decrypts
successfully.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import struct
from collections.abc import Sequence
from io import BytesIO

import numpy as np
from PIL import Image

from app.core.crypto import DecryptionError, decrypt, encrypt

# ---------------------------------------------------------------------------
# Constants / shared helpers
# ---------------------------------------------------------------------------

REAL_CHANNEL = 2   # blue — used by lsb / lsb-2bit / pvd / dct
DECOY_CHANNEL = 0  # red  — decoy only supported on lsb
_HEADER = struct.Struct(">I")

STEGO_METHODS = ("lsb", "lsb-rgb", "lsb-2bit", "pvd", "dct")

_SPLIT_MAGIC = "SGSPLIT1"


class StegoError(Exception):
    """Raised for capacity or format problems while embedding / extracting."""


# ---------------------------------------------------------------------------
# Shared bit utilities
# ---------------------------------------------------------------------------

def _bytes_to_bits(data: bytes) -> np.ndarray:
    return np.unpackbits(np.frombuffer(data, dtype=np.uint8))


def _bits_to_bytes(bits: np.ndarray) -> bytes:
    return np.packbits(bits).tobytes()


def _seed(password: str, tag: str = "") -> int:
    return int.from_bytes(
        hashlib.sha256((password + tag).encode()).digest()[:8], "big"
    )


def _perm(password: str, n: int, tag: str = "") -> np.ndarray:
    return np.random.default_rng(_seed(password, tag)).permutation(n)


# ---------------------------------------------------------------------------
# Method 1: LSB — blue channel, 1 bit/pixel, permuted  (original)
# ---------------------------------------------------------------------------

def _embed_lsb(arr: np.ndarray, payload: bytes, password: str) -> None:
    flat = arr[:, :, REAL_CHANNEL].reshape(-1)
    body = _HEADER.pack(len(payload)) + payload
    bits = _bytes_to_bits(body)
    if bits.size > flat.size:
        raise StegoError(
            f"Cover image too small: needs {bits.size} bits, has {flat.size}."
        )
    order = _perm(password, flat.size)[:bits.size]
    flat[order] = (flat[order] & 0xFE) | bits


def _extract_lsb(arr: np.ndarray, password: str) -> bytes:
    flat = arr[:, :, REAL_CHANNEL].reshape(-1)
    order = _perm(password, flat.size)
    header_bits = (flat[order[:32]] & 1).astype(np.uint8)
    (length,) = _HEADER.unpack(_bits_to_bytes(header_bits))
    if length <= 0 or 32 + length * 8 > flat.size:
        raise StegoError("No valid LSB payload for this password")
    payload_bits = (flat[order[32: 32 + length * 8]] & 1).astype(np.uint8)
    return _bits_to_bytes(payload_bits)


# Decoy channel (LSB only)
def _embed_lsb_channel(arr: np.ndarray, channel: int, payload: bytes, password: str) -> None:
    flat = arr[:, :, channel].reshape(-1)
    body = _HEADER.pack(len(payload)) + payload
    bits = _bytes_to_bits(body)
    if bits.size > flat.size:
        raise StegoError(
            f"Cover image too small: needs {bits.size} bits, has {flat.size}."
        )
    order = _perm(password, flat.size)[:bits.size]
    flat[order] = (flat[order] & 0xFE) | bits


def _extract_lsb_channel(arr: np.ndarray, channel: int, password: str) -> bytes:
    flat = arr[:, :, channel].reshape(-1)
    order = _perm(password, flat.size)
    header_bits = (flat[order[:32]] & 1).astype(np.uint8)
    (length,) = _HEADER.unpack(_bits_to_bytes(header_bits))
    if length <= 0 or 32 + length * 8 > flat.size:
        raise StegoError("No valid payload for this password")
    payload_bits = (flat[order[32: 32 + length * 8]] & 1).astype(np.uint8)
    return _bits_to_bytes(payload_bits)


# ---------------------------------------------------------------------------
# Method 2: LSB-RGB — 1 bit per channel across all 3 channels, 3× capacity
# ---------------------------------------------------------------------------

def _embed_lsb_rgb(arr: np.ndarray, payload: bytes, password: str) -> None:
    # Treat arr as (N*3,) flat stream: R0,G0,B0,R1,G1,B1,...
    flat = arr.reshape(-1)  # view over all channels
    body = _HEADER.pack(len(payload)) + payload
    bits = _bytes_to_bits(body)
    if bits.size > flat.size:
        raise StegoError(
            f"Cover image too small for lsb-rgb: needs {bits.size} bits, has {flat.size}."
        )
    order = _perm(password, flat.size, ":rgb")[:bits.size]
    flat[order] = (flat[order] & 0xFE) | bits


def _extract_lsb_rgb(arr: np.ndarray, password: str) -> bytes:
    flat = arr.reshape(-1)
    order = _perm(password, flat.size, ":rgb")
    header_bits = (flat[order[:32]] & 1).astype(np.uint8)
    (length,) = _HEADER.unpack(_bits_to_bytes(header_bits))
    if length <= 0 or 32 + length * 8 > flat.size:
        raise StegoError("No valid lsb-rgb payload for this password")
    payload_bits = (flat[order[32: 32 + length * 8]] & 1).astype(np.uint8)
    return _bits_to_bytes(payload_bits)


# ---------------------------------------------------------------------------
# Method 3: LSB-2BIT — 2 LSBs per pixel, blue channel, 2× capacity
# ---------------------------------------------------------------------------

def _embed_lsb_2bit(arr: np.ndarray, payload: bytes, password: str) -> None:
    flat = arr[:, :, REAL_CHANNEL].reshape(-1).copy()
    body = _HEADER.pack(len(payload)) + payload
    bits = _bytes_to_bits(body)
    # Pad to even length
    if len(bits) % 2:
        bits = np.append(bits, 0)
    n_slots = len(bits) // 2  # pixels needed
    if n_slots > flat.size:
        raise StegoError(
            f"Cover image too small for lsb-2bit: needs {n_slots} pixels, has {flat.size}."
        )
    order = _perm(password, flat.size, ":2bit")[:n_slots]
    values = (bits[0::2] << 1) | bits[1::2]  # 2-bit values 0-3
    flat[order] = (flat[order] & 0xFC) | values
    arr[:, :, REAL_CHANNEL] = flat.reshape(arr.shape[:2])


def _extract_lsb_2bit(arr: np.ndarray, password: str) -> bytes:
    flat = arr[:, :, REAL_CHANNEL].reshape(-1)
    order = _perm(password, flat.size, ":2bit")

    # Header: 32 bits → 16 pixels
    header_vals = (flat[order[:16]] & 0x03)
    header_bits = np.zeros(32, dtype=np.uint8)
    header_bits[0::2] = (header_vals >> 1) & 1
    header_bits[1::2] = header_vals & 1
    (length,) = _HEADER.unpack(_bits_to_bytes(header_bits))

    n_slots = -(-length * 8 // 2)  # ceil division — pixels for payload
    if length <= 0 or 16 + n_slots > flat.size:
        raise StegoError("No valid lsb-2bit payload for this password")

    payload_vals = (flat[order[16: 16 + n_slots]] & 0x03)
    payload_bits = np.zeros(n_slots * 2, dtype=np.uint8)
    payload_bits[0::2] = (payload_vals >> 1) & 1
    payload_bits[1::2] = payload_vals & 1
    return _bits_to_bytes(payload_bits[: length * 8])


# ---------------------------------------------------------------------------
# Method 4: PVD — Pixel Value Differencing
#
# For each pixel pair (p1, p2) processed in permuted order:
#   embed 3 secret bits by replacing the lower 3 bits of |p2 - p1|.
#   Recover: secret = |p2 - p1| & 7
# ---------------------------------------------------------------------------

def _embed_pvd(arr: np.ndarray, payload: bytes, password: str) -> None:
    flat = arr[:, :, REAL_CHANNEL].reshape(-1).astype(np.int32).copy()
    n_pairs = len(flat) // 2
    body = _HEADER.pack(len(payload)) + payload
    bits = _bytes_to_bits(body)

    if len(bits) > n_pairs * 3:
        raise StegoError(
            f"Cover too small for PVD: capacity {n_pairs * 3} bits, needs {len(bits)}."
        )

    order = _perm(password, n_pairs, ":pvd")
    bit_idx = 0

    for pair_i in order:
        if bit_idx >= len(bits):
            break
        i = int(pair_i) * 2
        p1, p2 = int(flat[i]), int(flat[i + 1])
        d = p2 - p1
        d_abs = abs(d)
        sign = 1 if d >= 0 else -1

        take = min(3, len(bits) - bit_idx)
        chunk = bits[bit_idx: bit_idx + take]
        if take < 3:
            chunk = np.pad(chunk, (0, 3 - take))
        secret_3 = int(chunk[0]) * 4 + int(chunk[1]) * 2 + int(chunk[2])

        new_d_abs = (d_abs & ~7) | secret_3   # replace lower 3 bits
        new_d = sign * new_d_abs
        p2_target = p1 + new_d

        if 0 <= p2_target <= 255:
            flat[i + 1] = p2_target
        elif p2_target > 255:
            # Move both: p2=255, p1 = 255 - new_d_abs
            flat[i + 1] = 255
            flat[i] = 255 - new_d_abs   # always ≥ 0 since new_d_abs ≤ 255
        else:
            # p2_target < 0: p2=0, p1 = new_d_abs
            flat[i + 1] = 0
            flat[i] = new_d_abs          # always ≤ 255

        bit_idx += take

    arr[:, :, REAL_CHANNEL] = flat.astype(np.uint8).reshape(arr.shape[:2])


def _extract_pvd(arr: np.ndarray, password: str) -> bytes:
    flat = arr[:, :, REAL_CHANNEL].reshape(-1).astype(np.int32)
    n_pairs = len(flat) // 2
    order = _perm(password, n_pairs, ":pvd")

    all_bits: list[int] = []
    length: int | None = None

    for pair_i in order:
        if length is not None and len(all_bits) >= 32 + length * 8:
            break
        i = int(pair_i) * 2
        d_abs = abs(int(flat[i + 1]) - int(flat[i]))
        s = d_abs & 7
        all_bits += [(s >> 2) & 1, (s >> 1) & 1, s & 1]

        if length is None and len(all_bits) >= 32:
            (length,) = _HEADER.unpack(_bits_to_bytes(np.array(all_bits[:32], dtype=np.uint8)))
            if not (0 < length <= n_pairs * 3 // 8):
                raise StegoError("No valid PVD payload for this password")

    if length is None:
        raise StegoError("Image too small for PVD header")
    total = 32 + length * 8
    if len(all_bits) < total:
        raise StegoError("Insufficient PVD data for this password")
    return _bits_to_bytes(np.array(all_bits[32:total], dtype=np.uint8))


# ---------------------------------------------------------------------------
# Method 5: DCT — modifies mid-frequency coefficients in 8×8 pixel blocks
# ---------------------------------------------------------------------------

# Precomputed orthonormal 8×8 DCT-II matrix
_N8 = 8
_k8 = np.arange(_N8, dtype=float)[:, None]
_n8 = np.arange(_N8, dtype=float)[None, :]
_DCT_M: np.ndarray = np.cos(np.pi * _k8 * (2 * _n8 + 1) / (2 * _N8)) * np.sqrt(2.0 / _N8)
_DCT_M[0] *= np.sqrt(0.5)   # orthonormal scaling for DC row

# Mid-frequency positions (zigzag bands 4-7)
_DCT_POS = [
    (0, 3), (1, 2), (2, 1), (3, 0),
    (0, 4), (1, 3), (2, 2), (3, 1), (4, 0),
    (1, 4), (2, 3), (3, 2), (4, 1),
    (2, 4), (3, 3), (4, 2),
]  # 16 positions → 16 bits per 8×8 block

_Q = 20  # quantisation step; large enough to survive uint8 round-trip


def _dct2(block: np.ndarray) -> np.ndarray:
    return _DCT_M @ block @ _DCT_M.T


def _idct2(block: np.ndarray) -> np.ndarray:
    return _DCT_M.T @ block @ _DCT_M


def _embed_dct(arr: np.ndarray, payload: bytes, password: str) -> None:
    ch = arr[:, :, REAL_CHANNEL].astype(float)
    h, w = ch.shape
    bh, bw = h // _N8, w // _N8
    n_blocks = bh * bw
    cap = n_blocks * len(_DCT_POS)

    body = _HEADER.pack(len(payload)) + payload
    bits = _bytes_to_bits(body)

    if len(bits) > cap:
        raise StegoError(
            f"Cover too small for DCT: capacity {cap} bits, needs {len(bits)}."
        )

    order = _perm(password, n_blocks, ":dct")
    bit_idx = 0

    for block_i in order:
        if bit_idx >= len(bits):
            break
        br, bc = divmod(int(block_i), bw)
        r0, c0 = br * _N8, bc * _N8
        block = ch[r0: r0 + _N8, c0: c0 + _N8]
        D = _dct2(block - 128.0)

        for (r, c) in _DCT_POS:
            if bit_idx >= len(bits):
                break
            bit = int(bits[bit_idx])
            q = int(round(D[r, c] / _Q))
            if q % 2 != bit:
                q = q + 1 if q >= 0 else q - 1
            D[r, c] = q * _Q
            bit_idx += 1

        ch[r0: r0 + _N8, c0: c0 + _N8] = np.clip(_idct2(D) + 128.0, 0, 255)

    arr[:, :, REAL_CHANNEL] = ch.astype(np.uint8)


def _extract_dct(arr: np.ndarray, password: str) -> bytes:
    ch = arr[:, :, REAL_CHANNEL].astype(float)
    h, w = ch.shape
    bh, bw = h // _N8, w // _N8
    n_blocks = bh * bw

    order = _perm(password, n_blocks, ":dct")
    all_bits: list[int] = []
    length: int | None = None

    for block_i in order:
        if length is not None and len(all_bits) >= 32 + length * 8:
            break
        br, bc = divmod(int(block_i), bw)
        r0, c0 = br * _N8, bc * _N8
        D = _dct2(ch[r0: r0 + _N8, c0: c0 + _N8] - 128.0)

        for (r, c) in _DCT_POS:
            if length is not None and len(all_bits) >= 32 + length * 8:
                break
            q = int(round(D[r, c] / _Q))
            all_bits.append(q % 2)

        if length is None and len(all_bits) >= 32:
            (length,) = _HEADER.unpack(
                _bits_to_bytes(np.array(all_bits[:32], dtype=np.uint8))
            )
            if not (0 < length <= n_blocks * len(_DCT_POS) // 8):
                raise StegoError("No valid DCT payload for this password")

    if length is None:
        raise StegoError("Image too small for DCT header")
    total = 32 + length * 8
    if len(all_bits) < total:
        raise StegoError("Insufficient DCT data for this password")
    return _bits_to_bytes(np.array(all_bits[32:total], dtype=np.uint8))


# ---------------------------------------------------------------------------
# Dispatch helpers
# ---------------------------------------------------------------------------

def _embed_payload(arr: np.ndarray, payload: bytes, password: str, method: str) -> None:
    if method == "lsb":
        _embed_lsb(arr, payload, password)
    elif method == "lsb-rgb":
        _embed_lsb_rgb(arr, payload, password)
    elif method == "lsb-2bit":
        _embed_lsb_2bit(arr, payload, password)
    elif method == "pvd":
        _embed_pvd(arr, payload, password)
    elif method == "dct":
        _embed_dct(arr, payload, password)
    else:
        raise StegoError(f"Unknown steganography method: {method!r}")


def _extract_payload(arr: np.ndarray, password: str, method: str) -> bytes:
    if method == "lsb":
        return _extract_lsb(arr, password)
    elif method == "lsb-rgb":
        return _extract_lsb_rgb(arr, password)
    elif method == "lsb-2bit":
        return _extract_lsb_2bit(arr, password)
    elif method == "pvd":
        return _extract_pvd(arr, password)
    elif method == "dct":
        return _extract_dct(arr, password)
    else:
        raise StegoError(f"Unknown steganography method: {method!r}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def embed_message(
    cover: str | bytes | BytesIO,
    message: str,
    password: str,
    *,
    method: str = "lsb",
    decoy_message: str | None = None,
    decoy_password: str | None = None,
) -> bytes:
    """Embed an AES-256-GCM encrypted message into a cover image. Returns PNG bytes."""
    if decoy_message and not decoy_password:
        raise StegoError("A decoy password is required when a decoy message is set")
    if decoy_password and not decoy_message:
        raise StegoError("A decoy message is required when a decoy password is set")
    if decoy_password and decoy_password == password:
        raise StegoError("The decoy password must differ from the real password")

    img = _open_rgb(cover)
    arr = np.array(img, dtype=np.uint8)

    _embed_payload(arr, encrypt(message, password).encode("ascii"), password, method)

    # Decoy always uses LSB red channel regardless of selected method
    if decoy_message and decoy_password:
        _embed_lsb_channel(
            arr,
            DECOY_CHANNEL,
            encrypt(decoy_message, decoy_password).encode("ascii"),
            decoy_password,
        )

    out = BytesIO()
    Image.fromarray(arr, "RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()


def extract_message(
    stego: str | bytes | BytesIO,
    password: str,
    *,
    method: str | None = None,
) -> str:
    """Extract and decrypt a hidden message.

    If ``method`` is given, tries that method first before falling back to all
    others.  This lets the setting serve as a hint while still recovering
    messages embedded by senders using a different method.
    """
    img = _open_rgb(stego)
    arr = np.array(img, dtype=np.uint8)

    # Build the ordered list of methods to try
    if method and method in STEGO_METHODS:
        order = [method] + [m for m in STEGO_METHODS if m != method]
    else:
        order = list(STEGO_METHODS)

    # Also try the decoy channel (LSB red)
    def _try_decoy() -> str | None:
        try:
            payload = _extract_lsb_channel(arr, DECOY_CHANNEL, password)
            return decrypt(payload.decode("ascii"), password)
        except Exception:
            return None

    last_err: Exception = StegoError("No hidden message found for this password")
    for m in order:
        try:
            payload = _extract_payload(arr, password, m)
            return decrypt(payload.decode("ascii"), password)
        except (StegoError, DecryptionError, UnicodeDecodeError, ValueError) as exc:
            last_err = exc

    # Last chance: decoy channel
    result = _try_decoy()
    if result is not None:
        return result

    raise StegoError("No hidden message found for this password") from last_err


def embed_message_split(
    covers: Sequence[str | bytes | BytesIO],
    message: str,
    password: str,
    *,
    method: str = "lsb",
) -> list[bytes]:
    """Split ``message`` across several cover images."""
    if len(covers) < 2:
        raise StegoError("Splitting needs at least 2 cover images")

    b64 = base64.b64encode(message.encode("utf-8")).decode("ascii")
    total = len(covers)
    group = secrets.token_hex(4)
    size = -(-len(b64) // total)
    shards = [b64[i * size: (i + 1) * size] for i in range(total)]

    outputs: list[bytes] = []
    for index, (cover, shard) in enumerate(zip(covers, shards, strict=True)):
        payload = f"{_SPLIT_MAGIC}|{group}|{index}|{total}|{shard}"
        try:
            outputs.append(embed_message(cover, payload, password, method=method))
        except StegoError as exc:
            raise StegoError(f"Image {index + 1} is too small for its share: {exc}") from exc
    return outputs


def extract_message_split(
    stegos: Sequence[str | bytes | BytesIO],
    password: str,
    *,
    method: str | None = None,
) -> str:
    """Reassemble a message split across images by :func:`embed_message_split`."""
    shards: dict[int, str] = {}
    group: str | None = None
    total: int | None = None

    for stego in stegos:
        raw = extract_message(stego, password, method=method)
        if not raw.startswith(_SPLIT_MAGIC + "|"):
            raise StegoError("One of the images is not part of a split message")
        _, g, idx_s, total_s, chunk = raw.split("|", 4)
        if group is None:
            group, total = g, int(total_s)
        elif g != group:
            raise StegoError("These images belong to different split messages")
        shards[int(idx_s)] = chunk

    if group is None or total is None:
        raise StegoError("No split-message shards found")
    missing = [i + 1 for i in range(total) if i not in shards]
    if missing:
        raise StegoError(
            f"Incomplete set: {len(shards)}/{total} images provided, missing part(s) {missing}"
        )

    b64 = "".join(shards[i] for i in range(total))
    try:
        return base64.b64decode(b64).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise StegoError("Could not reassemble message (corrupted shards)") from exc


def capacity_bytes(cover: str | bytes | BytesIO, method: str = "lsb") -> int:
    """Approximate maximum payload (bytes) for the given method."""
    img = _open_rgb(cover)
    w, h = img.size
    n = w * h
    if method == "lsb":
        return n // 8 - 4
    if method == "lsb-rgb":
        return (n * 3) // 8 - 4
    if method == "lsb-2bit":
        return (n * 2) // 8 - 4
    if method == "pvd":
        return (n // 2 * 3) // 8 - 4
    if method == "dct":
        blocks = (h // 8) * (w // 8)
        return (blocks * len(_DCT_POS)) // 8 - 4
    return n // 8 - 4


def _open_rgb(source: str | bytes | BytesIO) -> Image.Image:
    if isinstance(source, bytes | bytearray):
        source = BytesIO(source)
    try:
        return Image.open(source).convert("RGB")
    except Exception as exc:
        raise StegoError("Could not read image (unsupported or corrupted file)") from exc
