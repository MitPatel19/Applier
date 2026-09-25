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


class DatabaseEncryptedStorage:
    """Encrypted blobs in the ``stored_files`` table.

    Each call uses its own short transaction, so a stored file is durable as soon as ``put``
    returns (like a file write) and platforms without persistent disks lose nothing on redeploy.
    """

    def put(self, user_id: int, filename: str, data: bytes) -> str:
        from app.db import SessionLocal  # noqa: PLC0415 (avoid import cycle)
        from app.models import StoredFile  # noqa: PLC0415

        key = f"db/u{user_id}/{uuid.uuid4().hex}_{safe_filename(filename)}.enc"
        with SessionLocal() as db:
            db.add(StoredFile(user_id=user_id, key=key, data=encrypt_bytes(data)))
            db.commit()
        return key

    def get(self, key: str) -> bytes:
        from sqlalchemy import select  # noqa: PLC0415

        from app.db import SessionLocal  # noqa: PLC0415
        from app.models import StoredFile  # noqa: PLC0415

        with SessionLocal() as db:
            blob = db.scalar(select(StoredFile.data).where(StoredFile.key == key))
        if blob is None:
            raise FileNotFoundError(key)
        return decrypt_bytes(blob)

    def delete(self, key: str) -> None:
        from sqlalchemy import delete  # noqa: PLC0415

        from app.db import SessionLocal  # noqa: PLC0415
        from app.models import StoredFile  # noqa: PLC0415

        with SessionLocal() as db:
            db.execute(delete(StoredFile).where(StoredFile.key == key))
            db.commit()

    def delete_user(self, user_id: int) -> None:
        from sqlalchemy import delete  # noqa: PLC0415

        from app.db import SessionLocal  # noqa: PLC0415
        from app.models import StoredFile  # noqa: PLC0415

        with SessionLocal() as db:
            db.execute(delete(StoredFile).where(StoredFile.user_id == user_id))
            db.commit()


class RoutingStorage:
    """Writes to the configured backend; reads/deletes by key prefix, so files written by
    either backend stay readable if the setting changes."""

    def __init__(self, primary: Storage, files: LocalEncryptedStorage, database: DatabaseEncryptedStorage):
        self.primary, self.files, self.database = primary, files, database

    def _for(self, key: str) -> Storage:
        return self.database if key.startswith("db/") else self.files

    def put(self, user_id: int, filename: str, data: bytes) -> str:
        return self.primary.put(user_id, filename, data)

    def get(self, key: str) -> bytes:
        return self._for(key).get(key)

    def delete(self, key: str) -> None:
        self._for(key).delete(key)

    def delete_user(self, user_id: int) -> None:
        self.files.delete_user(user_id)
        self.database.delete_user(user_id)


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        s = get_settings()
        use_db = s.storage_backend == "database" or (s.storage_backend == "auto" and not s.uses_sqlite)
        files, database = LocalEncryptedStorage(s.storage_dir), DatabaseEncryptedStorage()
        _storage = RoutingStorage(database if use_db else files, files, database)
    return _storage
