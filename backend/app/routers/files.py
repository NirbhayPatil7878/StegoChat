"""Serve generated stego images / extracted payloads and sample covers."""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.config import settings
from app.services.storage import upload_path

router = APIRouter(prefix="/api", tags=["files"])


@router.get("/files/{name}")
def get_file(name: str):
    path = upload_path(name)
    if not path.exists() or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="File not found")
    return FileResponse(path, filename=path.name)


@router.get("/samples/{name}")
def get_sample(name: str):
    from pathlib import Path

    safe = Path(name).name
    path = settings.sample_dir / safe
    if not path.exists() or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Sample not found")
    return FileResponse(path, filename=path.name)
