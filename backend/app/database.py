"""Database engine, session factory and declarative base."""

import logging
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

logger = logging.getLogger("stegochat")

# SQLite needs ``check_same_thread=False`` because FastAPI serves requests
# from a thread pool. Postgres/other drivers ignore this connect arg.
connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the initial schema. Since dev uses create_all instead of
# migrations, we additively backfill them on startup so existing databases keep
# working. (column_name, DDL type + default clause)
_ADDITIVE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "direct_messages": [
        ("has_decoy", "BOOLEAN NOT NULL DEFAULT 0"),
        ("expires_at", "DATETIME"),
    ],
    "users": [
        ("totp_secret", "VARCHAR(64)"),
        ("totp_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
        ("totp_recovery_codes", "TEXT"),
    ],
}


def _backfill_columns() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _ADDITIVE_COLUMNS.items():
            if table not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl in columns:
                if name not in present:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    logger.info("Added column %s.%s", table, name)


def init_db() -> None:
    """Create all tables. Called on startup for dev; use migrations in prod."""
    # Import models so they register with the metadata before create_all.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _backfill_columns()
