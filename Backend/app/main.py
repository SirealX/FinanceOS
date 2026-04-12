from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import transactions, bills, summary, debts, savings, budget, preferences, categories

app = FastAPI(title="Finance App API")

# ── CORS — must be registered before routers ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
app.include_router(transactions.router)
app.include_router(bills.router)
app.include_router(debts.router)
app.include_router(savings.router)
app.include_router(budget.router)
app.include_router(summary.router)
app.include_router(preferences.router)
app.include_router(categories.router)

@app.get("/health")
def health_check():
    return {"status": "ok"}