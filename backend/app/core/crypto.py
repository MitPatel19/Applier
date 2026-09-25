"""Symmetric encryption for data at rest (OAuth tokens, uploaded documents)."""

from __future__ import annotations

import base64
import hashlib
import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

log = logging.getLogger("applier.crypto")


def _derived(passphrase: str, purpose: str) -> Fernet:
    digest = hashlib.sha256(f"{purpose}:{passphrase}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


@lru_cache
def _fernet() -> Fernet:
    s = get_settings()
    if not s.encryption_key:
        # Development fallback: derive a stable key from the secret key.
        return _derived(s.secret_key, "applier-dev-encryption")
    try:
        return Fernet(s.encryption_key.strip().encode())
    except ValueError:
        # Not a Fernet key (e.g. a passphrase pasted into the variable): derive one from it so the
        # app keeps working, and say how to use a proper random key.
        log.warning("APPLIER_ENCRYPTION_KEY is not a Fernet key; deriving one from it. For the strongest "
                    "protection, generate a key with scripts/generate-secrets.py (before storing documents).")
        return _derived(s.encryption_key.strip(), "applier-encryption")


def check_keys() -> None:
    """Log configuration problems with the secrets at startup (never logs the values)."""
    s = get_settings()
    if s.is_production and len(s.secret_key) < 32:
        log.warning("APPLIER_SECRET_KEY is only %d characters; use at least 32 random characters "
                    "(scripts/generate-secrets.py).", len(s.secret_key))
    _fernet()


def encrypt_bytes(data: bytes) -> bytes:
    return _fernet().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    return _fernet().decrypt(token)


def encrypt_str(value: str | None) -> str | None:
    if value is None:
        return None
    return _fernet().encrypt(value.encode()).decode()


def decrypt_str(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None
