#!/usr/bin/env python3
"""Print fresh production secrets for Applier (paste them into your hosting provider's variables).

Uses only the Python standard library, so it runs anywhere: python3 scripts/generate-secrets.py
"""

import base64
import os
import secrets

print(f"APPLIER_SECRET_KEY={secrets.token_urlsafe(48)}")
# A Fernet key is 32 random bytes, URL-safe base64 encoded.
print(f"APPLIER_ENCRYPTION_KEY={base64.urlsafe_b64encode(os.urandom(32)).decode()}")
