from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set.")

# Use the Supabase SESSION pooler URL (aws-0-*.pooler.supabase.com:5432).
# The direct host (db.*.supabase.co) resolves to IPv6 on Render free tier
# which has no outbound IPv6 support — use the pooler to stay on IPv4.
#
# Pool settings tuned for Supabase free tier (max 60 connections shared):
#   pool_size=2, max_overflow=3  → at most 5 connections from this process
#   pool_pre_ping=True           → discard stale connections after Supabase
#                                  pauses the project due to inactivity
#   pool_recycle=300             → recycle connections every 5 min
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300,
    pool_size=2,
    max_overflow=3,
    connect_args={"connect_timeout": 10},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()