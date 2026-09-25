"""Encrypted document storage.

Files are encrypted with Fernet before being written. The local filesystem backend is
used in development; the ``Storage`` interface allows an object-storage backend
(e.g. S3 with SSE-KMS) to be dropped in for production.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import get_settings
from app.core.crypto import decrypt_bytes, encrypt_bytes


class Storage(Protocol):
    def put(self, user_id: int, filename: str, data: bytes) -> str: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def delete_user(self, user_id: int) -> None: ...


_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(name: str) -> str:
    name = _SAFE.sub("_", name).strip("._") or "file"
    return name[:120]


class LocalEncryptedStorage:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("Invalid storage key")
        return path

    def put(self, user_id: int, filename: str, data: bytes) -> str:
        key = f"u{user_id}/{uuid.uuid4().hex}_{safe_filename(filename)}.enc"
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encrypt_bytes(data))
        return key

    def get(self, key: str) -> bytes:
        return decrypt_bytes(self._path(key).read_bytes())

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_user(self, user_id: int) -> None:
        folder = self.root / f"u{user_id}"
        if folder.exists():
            for p in folder.glob("*"):
                p.unlink(missing_ok=True)
            folder.rmdir()


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        _storage = LocalEncryptedStorage(get_settings().storage_dir)
    return _storage
