"""Database engine and session management."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    kwargs: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if url.startswith("sqlite:///") and ":memory:" not in url:
            from pathlib import Path

            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, **kwargs)
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _fk_pragma(dbapi_conn, _):  # enforce FK constraints on SQLite
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


engine = _make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@event.listens_for(Session, "before_flush")
def _normalize_datetimes(session: Session, _ctx, _instances) -> None:
    """Store every timestamp as naive UTC.

    Clients may send timezone-aware values (e.g. ``2026-09-24T20:45:00Z``); mixing aware and
    naive datetimes would break comparisons, so they are converted to UTC and made naive.
    """
    for obj in (*session.new, *session.dirty):
        mapper = inspect(obj).mapper
        for attr in mapper.column_attrs:
            column = attr.columns[0]
            if isinstance(column.type, DateTime):
                value = getattr(obj, attr.key)
                if isinstance(value, datetime) and value.tzinfo is not None:
                    setattr(obj, attr.key, value.astimezone(UTC).replace(tzinfo=None))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401  (register models)

    Base.metadata.create_all(bind=engine)
