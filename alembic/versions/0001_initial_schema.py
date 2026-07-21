"""Initial schema — normalized tables replacing JSONB blob.

Revision ID: 0001
Revises:
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("gid", sa.String(12), unique=True, nullable=False, index=True),
        sa.Column("role", sa.String(20), server_default="user"),
        sa.Column("plan", sa.String(20), server_default="demo"),
        sa.Column("whitelisted", sa.Boolean, server_default="false"),
        sa.Column("stripe_customer_id", sa.String(255), unique=True),
        sa.Column("stripe_subscription_id", sa.String(255)),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("tokens_limit", sa.Integer, server_default="5000"),
        sa.Column("renewal_date", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(512), unique=True, nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "runtime_states",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("gid", sa.String(12), unique=True, nullable=False, index=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("render_state", sa.JSON, server_default="{}"),
        sa.Column("tae_state", sa.String(20), server_default="ACTIVE"),
        sa.Column("devices", sa.JSON, server_default="[]"),
        sa.Column("syncori_queue", sa.JSON, server_default="[]"),
        sa.Column("syncori_index", sa.Integer, server_default="0"),
        sa.Column("console_log", sa.JSON, server_default="[]"),
        sa.Column("system_events", sa.JSON, server_default="[]"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "devices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("gid", sa.String(12), index=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="offline"),
        sa.Column("online", sa.Boolean, server_default="false"),
        sa.Column("metadata", sa.JSON, server_default="{}"),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "syncori_tracks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("gid", sa.String(12), index=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("artist", sa.String(255), nullable=False),
        sa.Column("album", sa.String(255)),
        sa.Column("duration", sa.String(20), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "tae_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("gid", sa.String(12), index=True, nullable=False),
        sa.Column("command", sa.Text, nullable=False),
        sa.Column("response", sa.Text),
        sa.Column("tools_used", sa.JSON, server_default="[]"),
        sa.Column("tokens_used", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "memories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("gid", sa.String(12), index=True, nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("category", sa.String(50), server_default="fact"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "usage_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("gid", sa.String(12), index=True),
        sa.Column("tokens", sa.Integer, server_default="0"),
        sa.Column("model", sa.String(50), server_default="gpt-4o-mini"),
        sa.Column("endpoint", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "plans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("price_cents", sa.Integer, server_default="0"),
        sa.Column("token_limit", sa.Integer, server_default="5000"),
        sa.Column("features", sa.JSON, server_default="{}"),
    )

    # Seed default plans
    op.execute("""
        INSERT INTO plans (id, name, price_cents, token_limit, features) VALUES
        (gen_random_uuid()::text, 'demo', 0, 5000, '{"render": true, "studio": "basic"}'),
        (gen_random_uuid()::text, 'starter', 1900, 50000, '{"render": true, "studio": "basic", "automations": 3}'),
        (gen_random_uuid()::text, 'pro', 4900, 200000, '{"render": true, "studio": "full", "automations": -1, "devices": -1}'),
        (gen_random_uuid()::text, 'enterprise', 0, 1000000, '{"render": true, "studio": "full", "automations": -1, "devices": -1, "sso": true}')
    """)


def downgrade():
    op.drop_table("plans")
    op.drop_table("usage_events")
    op.drop_table("memories")
    op.drop_table("tae_log")
    op.drop_table("syncori_tracks")
    op.drop_table("devices")
    op.drop_table("runtime_states")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
