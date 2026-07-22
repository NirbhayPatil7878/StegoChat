"""Steganography endpoints: embed, extract, EOF file hiding, forensics."""

# NOTE: intentionally NOT using `from __future__ import annotations` here.
# Stringized annotations break FastAPI's UploadFile/File detection on this
# version, so this router keeps real (evaluated) annotations.
import os
import secrets

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.config import settings
from app.core import forensics
from app.core.crypto import encrypt
from app.core.deps import get_current_user
from app.core.eof import EofError, eof_embed, eof_extract
from app.core.rate_limit import limiter
from app.core.stego import (
    StegoError,
    capacity_bytes,
    embed_message,
    embed_message_split,
    extract_message,
    extract_message_split,
)
from app.database import get_db
from app.models import ActivityType, Chat, Message, User
from app.schemas.stego import (
    EmbedResponse,
    ExtractResponse,
    ForensicResponse,
    RiskScanRequest,
    RiskScanResponse,
    SplitEmbedResponse,
    SplitPart,
)
from app.services.activity import log_activity
from app.services.storage import (
    read_any_upload,
    read_image_upload,
    safe_carrier_ext,
    save_bytes,
    save_stego,
    upload_path,
)

router = APIRouter(prefix="/api", tags=["stego"])


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


@router.get("/samples")
def list_samples():
    settings.sample_dir.mkdir(parents=True, exist_ok=True)
    files = [
        f
        for f in sorted(os.listdir(settings.sample_dir))
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    ]
    return {"samples": [{"name": f, "url": f"/api/samples/{f}"} for f in files]}


@router.post("/embed", response_model=EmbedResponse)
@limiter.limit(settings.rate_limit_embed)
async def embed(
    request: Request,
    message: str = Form(..., max_length=100_000),
    password: str = Form(..., min_length=1),
    image: UploadFile | None = File(default=None),
    sample: str | None = Form(default=None),
    decoy_message: str | None = Form(default=None),
    decoy_password: str | None = Form(default=None),
    chat_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Resolve cover image: uploaded file OR named sample.
    if image is not None and image.filename:
        cover_bytes = await read_image_upload(image)
        original_filename = image.filename
    elif sample:
        path = settings.sample_dir / os.path.basename(sample)
        if not path.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Sample image not found")
        cover_bytes = path.read_bytes()
        original_filename = os.path.basename(sample)
    else:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Provide an image upload or a sample name"
        )

    decoy_msg = (decoy_message or "").strip() or None
    decoy_pw = (decoy_password or "").strip() or None
    if bool(decoy_msg) != bool(decoy_pw):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Decoy message and password must both be set"
        )

    method = (user.settings.stego_method if user.settings else "lsb") or "lsb"
    try:
        stego_png = embed_message(
            cover_bytes,
            message,
            password,
            method=method,
            decoy_message=decoy_msg,
            decoy_password=decoy_pw,
        )
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    stego_name = save_stego(stego_png, prefix="stego")

    # Persist to history (ciphertext only, never the password/plaintext).
    chat = _resolve_chat(db, user, chat_id, message)
    preview = (message[:120] + "…") if len(message) > 120 else message
    record = Message(
        chat_id=chat.id,
        kind="embed",
        encrypted_message=encrypt(message, password),
        preview=preview,
        original_filename=original_filename,
        stego_filename=stego_name,
        has_decoy=bool(decoy_msg),
        size_bytes=len(stego_png),
    )
    db.add(record)
    db.flush()

    log_activity(
        db,
        user.id,
        ActivityType.EMBED,
        detail=preview[:80],
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()

    return EmbedResponse(
        stego_url=f"/api/files/{stego_name}",
        stego_filename=stego_name,
        message_id=record.id,
        chat_id=chat.id,
        decoy_enabled=bool(decoy_msg),
    )


@router.post("/extract", response_model=ExtractResponse)
@limiter.limit(settings.rate_limit_embed)
async def extract(
    request: Request,
    password: str = Form(..., min_length=1),
    image: UploadFile = File(...),
    chat_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not image or not image.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No image uploaded")
    raw = await read_any_upload(image)

    # Try EOF file payload first, then LSB text.
    try:
        payload, filename, mime = eof_extract(raw, password)
        out_name = f"payload_{secrets.token_hex(8)}_{os.path.basename(filename)}"
        upload_path(out_name).write_bytes(payload)
        log_activity(
            db,
            user.id,
            ActivityType.EXTRACT,
            detail=f"file:{filename}",
            ip_address=_client_ip(request),
        )
        return ExtractResponse(
            kind="file", filename=filename, mime=mime, payload_url=f"/api/files/{out_name}"
        )
    except EofError:
        pass

    method = (user.settings.stego_method if user.settings else None) or None
    try:
        message = extract_message(raw, password, method=method)
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    chat = _resolve_chat(db, user, chat_id, message)
    preview = (message[:120] + "…") if len(message) > 120 else message
    db.add(
        Message(
            chat_id=chat.id,
            kind="extract",
            encrypted_message=encrypt(message, password),
            preview=preview,
            original_filename=image.filename,
        )
    )
    log_activity(
        db,
        user.id,
        ActivityType.EXTRACT,
        detail=preview[:80],
        ip_address=_client_ip(request),
        commit=False,
    )
    db.commit()
    return ExtractResponse(kind="text", message=message)


@router.post("/eof-embed", response_model=EmbedResponse)
@limiter.limit(settings.rate_limit_embed)
async def eof_embed_route(
    request: Request,
    cover: UploadFile,
    payload: UploadFile,
    password: str = Form(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    cover_bytes = await read_image_upload(cover)
    payload_bytes = await read_any_upload(payload)
    mime = payload.content_type or "application/octet-stream"
    stego = eof_embed(cover_bytes, payload_bytes, payload.filename or "payload.bin", mime, password)
    stego_name = save_stego(stego, prefix="eof")
    log_activity(
        db,
        user.id,
        ActivityType.EMBED,
        detail=f"eof:{payload.filename}",
        ip_address=_client_ip(request),
    )
    return EmbedResponse(stego_url=f"/api/files/{stego_name}", stego_filename=stego_name)


@router.post("/eof-extract", response_model=ExtractResponse)
@limiter.limit(settings.rate_limit_embed)
async def eof_extract_route(
    request: Request,
    stego: UploadFile,
    password: str = Form(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    raw = await read_any_upload(stego)
    try:
        data, filename, mime = eof_extract(raw, password)
    except EofError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    out_name = f"payload_{secrets.token_hex(8)}_{os.path.basename(filename)}"
    upload_path(out_name).write_bytes(data)
    log_activity(
        db, user.id, ActivityType.EXTRACT, detail=f"eof:{filename}", ip_address=_client_ip(request)
    )
    return ExtractResponse(
        kind="file", filename=filename, mime=mime, payload_url=f"/api/files/{out_name}"
    )


@router.post("/embed-split", response_model=SplitEmbedResponse)
@limiter.limit(settings.rate_limit_embed)
async def embed_split(
    request: Request,
    message: str = Form(..., min_length=1, max_length=100_000),
    password: str = Form(..., min_length=1),
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Split one message across multiple cover images (removes the per-image
    capacity ceiling). Returns one stego PNG per image."""
    if len(images) < 2:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Provide at least 2 images to split across"
        )
    covers = [await read_image_upload(img) for img in images]
    try:
        outputs = embed_message_split(covers, message, password)
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    parts: list[SplitPart] = []
    for index, png in enumerate(outputs):
        name = save_stego(png, prefix="split")
        parts.append(SplitPart(index=index, stego_url=f"/api/files/{name}", stego_filename=name))
    log_activity(
        db,
        user.id,
        ActivityType.EMBED,
        detail=f"split:{len(outputs)} parts",
        ip_address=_client_ip(request),
    )
    return SplitEmbedResponse(total=len(parts), parts=parts)


@router.post("/extract-split", response_model=ExtractResponse)
@limiter.limit(settings.rate_limit_embed)
async def extract_split(
    request: Request,
    password: str = Form(..., min_length=1),
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Reassemble a message split across images. Upload all the parts."""
    if len(images) < 2:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Provide all the split images (at least 2)"
        )
    stegos = [await read_any_upload(img) for img in images]
    try:
        message = extract_message_split(stegos, password)
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    log_activity(
        db,
        user.id,
        ActivityType.EXTRACT,
        detail=f"split:{len(images)} parts",
        ip_address=_client_ip(request),
    )
    return ExtractResponse(kind="text", message=message)


@router.post("/hide-file", response_model=EmbedResponse)
@limiter.limit(settings.rate_limit_embed)
async def hide_file(
    request: Request,
    carrier: UploadFile,
    payload: UploadFile,
    password: str = Form(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Hide ANY payload file inside ANY carrier file (universal append).

    The payload is AES-256-GCM encrypted and appended after the carrier's real
    data with a marker. The carrier keeps its extension and still opens normally
    (a video still plays, a PDF still reads); the payload is recoverable only
    with the password.
    """
    carrier_bytes = await read_any_upload(carrier, max_bytes=settings.max_carrier_bytes)
    payload_bytes = await read_any_upload(payload, max_bytes=settings.max_carrier_bytes)
    mime = payload.content_type or "application/octet-stream"
    stego = eof_embed(
        carrier_bytes, payload_bytes, payload.filename or "payload.bin", mime, password
    )
    ext = safe_carrier_ext(carrier.filename)
    out_name = save_bytes(stego, prefix="carrier", ext=ext)
    log_activity(
        db,
        user.id,
        ActivityType.EMBED,
        detail=f"hide-file:{payload.filename}",
        ip_address=_client_ip(request),
    )
    return EmbedResponse(stego_url=f"/api/files/{out_name}", stego_filename=out_name)


@router.post("/reveal-file", response_model=ExtractResponse)
@limiter.limit(settings.rate_limit_embed)
async def reveal_file(
    request: Request,
    carrier: UploadFile,
    password: str = Form(..., min_length=1),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Recover a payload hidden with /hide-file from any carrier file."""
    raw = await read_any_upload(carrier, max_bytes=settings.max_carrier_bytes)
    try:
        data, filename, mime = eof_extract(raw, password)
    except EofError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    out_name = f"payload_{secrets.token_hex(8)}_{os.path.basename(filename)}"
    upload_path(out_name).write_bytes(data)
    log_activity(
        db,
        user.id,
        ActivityType.EXTRACT,
        detail=f"reveal-file:{filename}",
        ip_address=_client_ip(request),
    )
    return ExtractResponse(
        kind="file", filename=filename, mime=mime, payload_url=f"/api/files/{out_name}"
    )


@router.post("/scan-risk", response_model=RiskScanResponse)
def scan_risk(payload: RiskScanRequest, user: User = Depends(get_current_user)):
    return RiskScanResponse(**forensics.scan_message_risk(payload.message))


@router.post("/forensics", response_model=ForensicResponse)
async def forensic_analyze(image: UploadFile, user: User = Depends(get_current_user)):
    raw = await read_any_upload(image)
    return ForensicResponse(**forensics.analyze(raw, image.filename or ""))


@router.get("/capacity")
async def capacity(image: UploadFile, user: User = Depends(get_current_user)):
    raw = await read_image_upload(image)
    try:
        return {"capacity_bytes": capacity_bytes(raw)}
    except StegoError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def _resolve_chat(db: Session, user: User, chat_id: int | None, message: str) -> Chat:
    if chat_id is not None:
        chat = db.query(Chat).filter(Chat.id == chat_id, Chat.owner_id == user.id).first()
        if chat is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chat not found")
        return chat
    title = (message[:40] + "…") if len(message) > 40 else (message or "Untitled")
    chat = Chat(owner_id=user.id, title=title)
    db.add(chat)
    db.flush()
    return chat
