"""
app/routers/jwks.py
─────────────────────────────────────────────────────────────────────────────
JWKS (JSON Web Key Set) public endpoint.

Required by Bancolombia's Open Finance / FAPI 2.0 registration.
Bancolombia hits this URL to verify that signed JWTs originate from us.

Endpoint:  GET /.well-known/jwks.json
Live URL:  https://financeos-pmdd.onrender.com/.well-known/jwks.json

IMPORTANT:
  - This endpoint only exposes the PUBLIC key. The private key never leaves
    the server and is stored as the BANCOLOMBIA_PRIVATE_KEY env variable.
  - The 'n' and 'e' values below come from the RSA-2048 key pair generated
    during Bancolombia sandbox registration. If you ever rotate the key pair,
    update BOTH this file and re-register the new certificate with Bancolombia.
  - No authentication required on this endpoint — it must be publicly
    reachable so Bancolombia can fetch it at any time.
─────────────────────────────────────────────────────────────────────────────
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["security"])

# ── Public key in JWKS format ─────────────────────────────────────────────────
# Generated from the RSA-2048 certificate submitted to Bancolombia.
# kid must match what is sent in signed JWT headers (x-kid or similar).
_JWKS = {
    "keys": [
        {
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "financeos-bancolombia-key-1",
            "n":   (
                "uMPehhBP37sat-evFpQzzuoIPfRS3ilJkmRnZlPPFRhGEbQMuZWLwe4Pkw"
                "JjxfWx7k35srJ5Nvu80LI5EpZowtkbei390YnTmlZ_Y8B_2ihU3lGBMu5t"
                "V-j3YD82NiuF-axgnLwnn0RSP7oIrz8vkNZFZMdgGpXxyxGbJe8-iN3_vR"
                "hyf2_nCXZ1r3tjCN1ibAftWfCozclvPQb3YVvZvj3xHlUAFpvg7LgSV-US"
                "ozlVU0jT4q0rydKpQsB5p5nkw5V6xJOiWU6-xjFO0KyTEbPy2dfTWNbBjt"
                "wUmTv8tUTCJ_m4exswEsghqXau1R8vo70lXT5tjDjqEXQXk6o-Pw"
            ),
            "e":   "AQAB",
        }
    ]
}


@router.get("/.well-known/jwks.json", include_in_schema=False)
def get_jwks():
    """
    Publicly accessible JWKS endpoint.
    Returns the RSA public key used to verify signed JWTs from this app.
    Bancolombia fetches this during FAPI 2.0 token validation.
    """
    return JSONResponse(
        content=_JWKS,
        headers={
            # Allow Bancolombia's servers to cache this — keys rotate rarely
            "Cache-Control": "public, max-age=3600",
            "Content-Type":  "application/json",
        },
    )
