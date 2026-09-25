"""Encrypted document storage: database and filesystem backends."""

from app.core.storage import DatabaseEncryptedStorage, LocalEncryptedStorage, RoutingStorage
from app.models import StoredFile


def test_database_storage_roundtrip_is_encrypted(user, db, tmp_path):
    storage = RoutingStorage(DatabaseEncryptedStorage(), LocalEncryptedStorage(tmp_path), DatabaseEncryptedStorage())
    key = storage.put(user.id, "Mit Patel resume.pdf", b"%PDF-1.7 secret resume")
    assert key.startswith("db/")
    raw = db.query(StoredFile).filter_by(key=key).one().data
    assert b"secret resume" not in raw  # encrypted at rest
    assert storage.get(key) == b"%PDF-1.7 secret resume"
    storage.delete(key)
    assert db.query(StoredFile).filter_by(key=key).count() == 0


def test_routing_reads_files_written_by_either_backend(user, tmp_path):
    files = LocalEncryptedStorage(tmp_path)
    database = DatabaseEncryptedStorage()
    file_key = files.put(user.id, "old.pdf", b"old")
    storage = RoutingStorage(database, files, database)
    db_key = storage.put(user.id, "new.pdf", b"new")
    assert storage.get(file_key) == b"old"
    assert storage.get(db_key) == b"new"
    storage.delete_user(user.id)
    assert not (tmp_path / f"u{user.id}").exists()


def test_platform_defaults(monkeypatch):
    from app.core.config import Settings

    monkeypatch.setenv("RAILWAY_PUBLIC_DOMAIN", "applier.up.railway.app")
    monkeypatch.delenv("APPLIER_FRONTEND_URL", raising=False)
    s = Settings()
    assert s.frontend_url == "https://applier.up.railway.app"
    assert s.cookie_secure is True
    assert "https://applier.up.railway.app" in s.cors_origins


def test_non_fernet_encryption_key_is_derived(monkeypatch):
    from app.core import crypto
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "encryption_key", "my-simple-passphrase")
    crypto._fernet.cache_clear()
    try:
        token = crypto.encrypt_bytes(b"resume")
        assert crypto.decrypt_bytes(token) == b"resume"
    finally:
        crypto._fernet.cache_clear()
