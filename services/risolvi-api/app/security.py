from __future__ import annotations

import hashlib
import hmac
import secrets


def new_capability_token() -> str:
    return secrets.token_urlsafe(32)


def hash_capability(token: str, secret: str) -> str:
    if not token:
        return ""
    return hmac.new(secret.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_capability(token: str | None, expected_hash: str, secret: str) -> bool:
    if not token or not expected_hash:
        return False
    actual = hash_capability(token, secret)
    return hmac.compare_digest(actual, expected_hash)
