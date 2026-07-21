"""SQLAlchemy 2.0 models for the production schema.

Replaces the single JSONB-blob persistence with normalized tables.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    String, Integer, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, Index,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import func


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(255))
    gid: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(20), default="user")  # user|beta|alpha|owner
    plan: Mapped[str] = mapped_column(String(20), default="demo")  # demo|starter|pro|enterprise
    whitelisted: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255))
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    tokens_limit: Mapped[int] = mapped_column(Integer, default=5000)
    renewal_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    runtime_states: Mapped[list["RuntimeState"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    memories: Mapped[list["Memory"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    usage_events: Mapped[list["UsageEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token: Mapped[str] = mapped_column(String(512), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class RuntimeState(Base):
    """Per-GID runtime state — replaces the single JSONB blob."""
    __tablename__ = "runtime_states"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    gid: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    render_state: Mapped[dict] = mapped_column(JSON, default=dict)
    tae_state: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    devices: Mapped[list] = mapped_column(JSON, default=list)
    syncori_queue: Mapped[list] = mapped_column(JSON, default=list)
    syncori_index: Mapped[int] = mapped_column(Integer, default=0)
    console_log: Mapped[list] = mapped_column(JSON, default=list)
    system_events: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="runtime_states")


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    gid: Mapped[str] = mapped_column(String(12), index=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="offline")
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SyncoriTrack(Base):
    __tablename__ = "syncori_tracks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    gid: Mapped[str] = mapped_column(String(12), index=True)
    title: Mapped[str] = mapped_column(String(255))
    artist: Mapped[str] = mapped_column(String(255))
    album: Mapped[str | None] = mapped_column(String(255))
    duration: Mapped[str] = mapped_column(String(20))
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TaeLog(Base):
    __tablename__ = "tae_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    gid: Mapped[str] = mapped_column(String(12), index=True)
    command: Mapped[str] = mapped_column(Text)
    response: Mapped[str | None] = mapped_column(Text)
    tools_used: Mapped[list] = mapped_column(JSON, default=list)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    gid: Mapped[str] = mapped_column(String(12), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), default="fact")  # fact|preference|event
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="memories")


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    gid: Mapped[str] = mapped_column(String(12), index=True)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    model: Mapped[str] = mapped_column(String(50), default="gpt-4o-mini")
    endpoint: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="usage_events")


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)  # demo|starter|pro|enterprise
    price_cents: Mapped[int] = mapped_column(Integer, default=0)
    token_limit: Mapped[int] = mapped_column(Integer, default=5000)
    features: Mapped[dict] = mapped_column(JSON, default=dict)
