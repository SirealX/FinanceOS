import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import transactions, bills, summary, debts, savings, budget, preferences, categories, alerts
from app.routers import import_router, export
from app.alert_scheduler import scheduler_router
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Finance App API", redirect_slashes=False)

# ── CORS — must be registered before routers ──────────────────────────────────
# In production, set ALLOWED_ORIGINS on Render to your Vercel URL(s):
#   e.g.  ALLOWED_ORIGINS=https://financeos.vercel.app,https://www.financeos.vercel.app
# Multiple origins are comma-separated.
# Localhost origins are always included so local dev keeps working.
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
_production_origins = [o.strip().rstrip("/") for o in _origins_env.split(",") if o.strip()]

allow_origins = list(set([
    # ── Local development ──────────────────────────────────────────────────────
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    # ── Production (hardcoded as safety net — no trailing slash!) ─────────────
    "https://project-financeos.vercel.app",
    # ── Production origins from ALLOWED_ORIGINS env var ───────────────────────
    *_production_origins,
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── Routers ──
app.include_router(transactions.router)
app.include_router(bills.router)
app.include_router(debts.router)
app.include_router(savings.router)
app.include_router(budget.router)
app.include_router(summary.router)
app.include_router(alerts.router)
app.include_router(categories.router)   # FIX: was imported but never registered
app.include_router(preferences.router)  # FIX: was imported but never registered
app.include_router(import_router.router)
app.include_router(export.router)
app.include_router(scheduler_router)