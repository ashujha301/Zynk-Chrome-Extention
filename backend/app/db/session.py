from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5,           # Neon free tier has a connection limit — keep this low
    max_overflow=2,
    pool_pre_ping=True,    # verifies connection is alive before using it
    pool_recycle=300,      # recycle connections every 5 min (Neon closes idle ones)
    connect_args={
        "sslmode": "require",
        "connect_timeout": 10,         # fail fast instead of hanging
    }
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)