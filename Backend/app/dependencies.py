"""
app/dependencies.py
─────────────────────────────────────────────────────────────────────────────
FastAPI dependency that verifies the Supabase-issued JWT on every protected
request and returns the caller's user UUID.

HOW SUPABASE AUTH WORKS WITH FASTAPI
  1. The React frontend signs in via @supabase/supabase-js.
  2. Supabase issues a JWT signed with an EC private key (ES256).
  3. The frontend sends that token in every API call:
       Authorization: Bearer <token>
  4. This dependency fetches the matching EC public key from the Supabase
     JWKS endpoint and uses it to verify the signature.
  5. The `sub` claim in the payload is the user's UUID — we return that as
     `current_user` in every protected route.

ENVIRONMENT VARIABLES REQUIRED
  SUPABASE_URL         → Supabase Dashboard → Settings → API → Project URL
                         e.g. https://xxxxxxxxxxxx.supabase.co
  SUPABASE_JWT_SECRET  → Only used as a fallback for HS256 tokens (legacy).
                         Supabase Dashboard → Settings → API → JWT Secret

ALGORITHM NOTES
  Supabase uses ES256 (asymmetric EC key pair) by default.
  The public key is served at {SUPABASE_URL}/.well-known/jwks.json.
  We fetch the JWKS once at startup and cache it in _JWKS.

USAGE IN A ROUTER
  from ..dependencies import get_current_user

  @router.get("/")
  def my_endpoint(
      current_user: str = Depends(get_current_user),
      db: Session = Depends(get_db),
  ):
      # current_user is the user's UUID string
      rows = db.query(MyModel).filter(MyModel.user_id == current_user).all()
      return rows
─────────────────────────────────────────────────────────────────────────────
"""

import os
import json
import time
import urllib.request
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from jose.exceptions import JOSEError

# Ensure .env is loaded even if this module is imported before database.py
load_dotenv()

# ── Security scheme ────────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)

# ── Config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")  # fallback for HS256

# Supabase sets audience="authenticated" on all user JWTs
AUDIENCE = "authenticated"


# ── JWKS fetch (runs once at startup) ─────────────────────────────────────────
def _fetch_jwks() -> dict | None:
    """
    Download the JWKS from Supabase and cache it.
    Returns the parsed JSON dict, or None on failure.
    """
    if not SUPABASE_URL:
        print("[dependencies] SUPABASE_URL is not set — JWKS fetch skipped.")
        return None
    url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read())
            print(f"[dependencies] JWKS loaded: {len(data.get('keys', []))} key(s)")
            return data
    except Exception as exc:
        print(f"[dependencies] WARNING — could not fetch JWKS from {url}: {exc}")
        return None


# ── ARCH-04: TTL-aware JWKS cache ────────────────────────────────────────────
# Supabase rotates keys every ~6 hours.  Fetching once at startup means a key
# rotation locks out all users until the server restarts.  The cache below
# refreshes automatically after _JWKS_TTL_SECONDS to avoid this.

_JWKS_CACHE: dict | None = _fetch_jwks()   # warm the cache at startup
_JWKS_FETCHED_AT: float = time.time()
_JWKS_TTL_SECONDS: float = 6 * 3600        # 6 hours — matches Supabase rotation


def _get_jwks() -> dict | None:
    """Return the cached JWKS, refreshing if the cache is older than TTL."""
    global _JWKS_CACHE, _JWKS_FETCHED_AT
    if (time.time() - _JWKS_FETCHED_AT) > _JWKS_TTL_SECONDS:
        fresh = _fetch_jwks()
        if fresh is not None:
            _JWKS_CACHE = fresh
        # Always advance the timestamp so we don't hammer the endpoint on failure
        _JWKS_FETCHED_AT = time.time()
    return _JWKS_CACHE


# ── Key resolution ─────────────────────────────────────────────────────────────
def _resolve_key(token: str):
    """
    Inspect the JWT header and return (key, [algorithm]) ready for jwt.decode().

    Priority:
      1. If the header says ES256 or RS256 and we have JWKS keys, match by `kid`
         (or fall back to the first key).
      2. Otherwise fall back to the HS256 shared secret.
    """
    try:
        header = jwt.get_unverified_header(token)
    except (JWTError, JOSEError):
        # Can't read header at all — let decode() produce a proper error
        return SUPABASE_JWT_SECRET, ["HS256"]

    alg = header.get("alg", "ES256")

    jwks = _get_jwks()   # ARCH-04 fix: use TTL-refreshed cache
    if alg in ("ES256", "RS256") and jwks and "keys" in jwks:
        kid = header.get("kid")
        # Prefer the key whose `kid` matches the token header
        matched_key = None
        for k in jwks["keys"]:
            if kid and k.get("kid") == kid:
                matched_key = k
                break
        # If no kid match, use the first available key
        if matched_key is None and jwks["keys"]:
            matched_key = jwks["keys"][0]

        if matched_key:
            # Pass the raw JWK dict — jwt.decode() will construct the key internally
            return matched_key, [alg]

    # Fallback: HS256 with the shared secret
    return SUPABASE_JWT_SECRET, ["HS256"]


# ── Dependency ─────────────────────────────────────────────────────────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Verifies the Supabase JWT (ES256 via JWKS, or HS256 fallback) and returns
    the caller's user UUID (the `sub` claim).
    Raises HTTP 401 if the token is absent, expired, or invalid.
    """
    # ── Missing token ──────────────────────────────────────────────────────────
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    key, algorithms = _resolve_key(token)

    # ── Verify + decode ────────────────────────────────────────────────────────
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=AUDIENCE,
        )
    except (JWTError, JOSEError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing the user ID (sub claim).",
        )

    return user_id
