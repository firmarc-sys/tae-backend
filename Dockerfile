# ── Build stage: install Python deps ──
FROM python:3.12-slim AS builder
WORKDIR /app
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --compile-bytecode

# ── Runtime stage ──
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:asgi", "--host", "0.0.0.0", "--port", "8000"]
