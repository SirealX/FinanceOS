from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import transactions, bills, summary, debts, savings, budget, preferences, categories, alerts
from app.routers import import_router, export
from app.alert_scheduler import scheduler_router

app = FastAPI(title="Finance App API", redirect_slashes=False)

# ── CORS — must be registered before routers ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
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