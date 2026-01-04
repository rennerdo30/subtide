# Video Translate Backend
# Multi-stage build for smaller production image

# ============================================================================
# Base stage with Python and system dependencies
# ============================================================================
FROM python:3.11-slim AS base

# Install uv (The Python Package Installer)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install system dependencies with cache
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl

WORKDIR /app

# ============================================================================
# Dependencies stage
# ============================================================================
FROM base AS dependencies

# Install Python dependencies using uv (much faster)
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache-dir -r requirements.txt

# ============================================================================
# Development stage (includes dev tools)
# ============================================================================
FROM dependencies AS development

# Install dev dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache-dir \
    watchdog \
    pytest \
    pytest-cov

COPY . .

# Create cache directory
RUN mkdir -p cache && chmod 777 cache

ENV FLASK_ENV=development
ENV LOG_LEVEL=DEBUG

EXPOSE 5001

CMD ["python", "app.py"]

# ============================================================================
# Production stage (optimized)
# ============================================================================
FROM dependencies AS production

# Install production server USE UV
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --no-cache-dir gunicorn gevent

# Copy application code
COPY . .

# Create non-root user for security
RUN useradd -m -u 1000 appuser \
    && mkdir -p /app/cache \
    && chown -R appuser:appuser /app

USER appuser

# Production settings
ENV FLASK_ENV=production
ENV LOG_LEVEL=INFO
ENV LOG_JSON=true
ENV PYTHONUNBUFFERED=1

EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

# Run with Gunicorn (gevent for SSE support)
CMD ["gunicorn", \
    "--worker-class", "gevent", \
    "--workers", "2", \
    "--bind", "0.0.0.0:5001", \
    "--timeout", "300", \
    "--keep-alive", "65", \
    "--access-logfile", "-", \
    "--error-logfile", "-", \
    "app:app"]
