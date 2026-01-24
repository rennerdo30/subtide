"""
Logging configuration for Subtide backend.
Supports structured JSON logging for production and human-readable for development.
"""

import logging
import sys
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from functools import wraps
from contextlib import contextmanager

import threading
import traceback

class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': datetime.now(timezone.utc).isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }

        # Add extra fields if present
        extra_fields = ['video_id', 'stage', 'duration', 'request_id', 
                        'step', 'total_steps', 'batch', 'total_batches', 
                        'eta', 'percent', 'source_type', 'error_type', 'hint']
        for field in extra_fields:
            if hasattr(record, field):
                log_data[field] = getattr(record, field)

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.format_exception(record.exc_info)

        return json.dumps(log_data)

    def format_exception(self, exc_info) -> dict:
        """Format exception info into a structured dictionary."""
        exc_type, exc_value, exc_traceback = exc_info
        return {
            'type': exc_type.__name__,
            'message': str(exc_value),
            'traceback': traceback.format_exception(exc_type, exc_value, exc_traceback)
        }


class ColoredFormatter(logging.Formatter):
    """Colored formatter for development."""

    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    BOLD = '\033[1m'

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{color}{record.levelname:8}{self.RESET}"
        
        # Add context info if available
        context_parts = []
        if hasattr(record, 'video_id'):
            context_parts.append(f"video={record.video_id}")
        if hasattr(record, 'request_id'):
            context_parts.append(f"req={record.request_id[:8]}")
        if hasattr(record, 'step') and hasattr(record, 'total_steps'):
            context_parts.append(f"step={record.step}/{record.total_steps}")
        if hasattr(record, 'duration'):
            context_parts.append(f"duration={record.duration:.2f}s")
            
        if context_parts:
            record.msg = f"[{' | '.join(context_parts)}] {record.msg}"
            
        return super().format(record)


def setup_logging(
    level: str = 'INFO',
    json_format: bool = False,
    log_file: Optional[str] = None
) -> logging.Logger:
    """
    Configure logging for the application.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        json_format: Use JSON format (for production)
        log_file: Optional file path for logging
    """
    logger = logging.getLogger('subtide')
    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Clear existing handlers
    logger.handlers = []

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)

    if json_format:
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(ColoredFormatter(
            '%(asctime)s %(levelname)s [%(name)s] %(message)s',
            datefmt='%H:%M:%S'
        ))

    logger.addHandler(console_handler)

    # File handler (if specified)
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(JSONFormatter())  # Always JSON for files
        logger.addHandler(file_handler)

    # Reduce noise from other libraries
    logging.getLogger('urllib3').setLevel(logging.WARNING)
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.getLogger('yt_dlp').setLevel(logging.WARNING)

    return logger


def generate_request_id() -> str:
    """Generate a unique request ID for log correlation."""
    return str(uuid.uuid4())


def mask_api_key(api_key: Optional[str], visible_chars: int = 4) -> str:
    """
    Mask an API key for safe logging, showing only first and last few characters.

    SECURITY: Use this function when logging any sensitive credentials.

    Examples:
        mask_api_key("sk-abc123xyz789") -> "sk-a...789"
        mask_api_key("AIzaSy1234567890abc") -> "AIza...abc"
        mask_api_key(None) -> "[not set]"
        mask_api_key("short") -> "****"

    Args:
        api_key: The API key to mask
        visible_chars: Number of characters to show at start and end (default 4)

    Returns:
        Masked string safe for logging
    """
    if not api_key:
        return "[not set]"

    if len(api_key) <= visible_chars * 2 + 3:
        # Key is too short to mask meaningfully
        return "*" * len(api_key)

    prefix = api_key[:visible_chars]
    suffix = api_key[-visible_chars:]
    return f"{prefix}...{suffix}"



class LogContext:
    """Thread-local context for request tracking."""
    _thread_local = threading.local()
    
    @classmethod
    def _get_context(cls) -> dict:
        if not hasattr(cls._thread_local, 'context'):
            cls._thread_local.context = {}
        return cls._thread_local.context

    @classmethod
    def set(cls, **kwargs):
        """Set context values for the current thread."""
        cls._get_context().update(kwargs)
    
    @classmethod
    def get(cls, key: str, default=None):
        """Get a context value."""
        return cls._get_context().get(key, default)
    
    @classmethod
    def clear(cls):
        """Clear all context for the current thread."""
        if hasattr(cls._thread_local, 'context'):
            cls._thread_local.context = {}
    
    @classmethod
    def get_all(cls) -> dict:
        """Get all context values."""
        return cls._get_context().copy()


def log_with_context(logger: logging.Logger, level: str, message: str, **context):
    """Log with extra context fields."""
    # Merge with thread-local context
    full_context = {**LogContext.get_all(), **context}
    
    record = logger.makeRecord(
        logger.name, getattr(logging, level.upper()),
        '', 0, message, (), None
    )
    for key, value in full_context.items():
        setattr(record, key, value)
    logger.handle(record)


@contextmanager
def log_timing(logger: logging.Logger, operation: str, **context):
    """Context manager for timing operations and logging duration."""
    start_time = time.time()
    try:
        yield
    finally:
        duration = time.time() - start_time
        log_with_context(
            logger, 'INFO', 
            f"{operation} completed",
            duration=duration,
            **context
        )


def log_stage(logger: logging.Logger, stage: str, message: str, 
              step: int = None, total_steps: int = None, 
              percent: int = None, **context):
    """Log a processing stage with structured data."""
    log_with_context(
        logger, 'INFO', message,
        stage=stage,
        step=step,
        total_steps=total_steps,
        percent=percent,
        **context
    )


def timed(logger: logging.Logger = None):
    """Decorator to time function execution."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            nonlocal logger
            if logger is None:
                logger = logging.getLogger('subtide')

            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                log_with_context(
                    logger, 'DEBUG',
                    f"{func.__name__} completed",
                    duration=duration
                )
                return result
            except Exception as e:
                duration = time.time() - start_time
                log_with_context(
                    logger, 'ERROR',
                    f"{func.__name__} failed: {str(e)}",
                    duration=duration,
                    error_type=type(e).__name__
                )
                raise
        return wrapper
    return decorator


def setup_request_id_middleware(app):
    """
    Setup Flask middleware to automatically add request IDs to all requests.

    Usage:
        from backend.utils.logging_utils import setup_request_id_middleware
        setup_request_id_middleware(app)

    The request ID is:
    - Generated for each request (or uses X-Request-ID header if provided)
    - Stored in LogContext for use in all log messages
    - Added to response headers as X-Request-ID
    """
    from flask import request, g

    @app.before_request
    def add_request_id():
        # Use provided request ID or generate new one
        request_id = request.headers.get('X-Request-ID') or generate_request_id()
        g.request_id = request_id
        LogContext.set(request_id=request_id)

        # Also set video_id if present in request
        video_id = request.args.get('video_id') or request.json.get('video_id') if request.is_json else None
        if video_id:
            LogContext.set(video_id=video_id)

    @app.after_request
    def add_request_id_header(response):
        if hasattr(g, 'request_id'):
            response.headers['X-Request-ID'] = g.request_id
        return response

    @app.teardown_request
    def clear_log_context(exception=None):
        LogContext.clear()
