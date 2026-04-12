"""
app/dependencies.py
─────────────────────────────────────────────────────────────────────────────
FastAPI dependency that verifies the Supabase-issued JWT on every protected
request and returns the caller's user UUID.

HOW SUPABASE AUTH WORKS WITH FASTAPI
  1. The React frontend signs in via @supabase/supabase-js.
  2. Supabase issues a JWT signed with the project's JWT_SECRET (HS256).
  3. The frontend sends that token in every API call:
       Authorization: Bearer <token>
  4. This dependency decodes and verifies the token.
  5. The `sub` claim in the payload is the user's UUID — we return that as
     `current_user` in every protected route.

ENVIRONMENT VARIABLES REQUIRED
  SUPABASE_JWT_SECRET  → Supabase Dashboard → Settings → API → JWT Secret
                         (the long secret, NOT the anon or service_role key)

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
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

# ── Security scheme ────────────────────────────────────────────────────────────
# HTTPBearer extracts the token from the Authorization header automatically.
# auto_error=False means we handle the 401 ourselves with a clearer message.
security = HTTPBearer(auto_error=False)

# ── JWT config ─────────────────────────────────────────────────────────────────
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
ALGORITHM = "HS256"
# Supabase sets audience="authenticated" on all user JWTs
AUDIENCE = "authenticated"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    """
    Verifies the Supabase JWT and returns the caller's user UUID (the `sub`
    claim). Raises HTTP 401 if the token is absent, expired, or invalid.
    """
    # ── Missing token ──────────────────────────────────────────────────────────
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Missing secret — configuration error, not caller error ────────────────
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfiguration: SUPABASE_JWT_SECRET is not set.",
        )

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=[ALGORITHM],
            audience=AUDIENCE,
        )
    except JWTError as exc:
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