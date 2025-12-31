"""
Logging configuration for Video Translate backend.
Supports structured JSON logging for production and human-readable for development.
"""

import logging
import sys
import json
from datetime import datetime
from typing import Optional


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging in production."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
        }

        # Add extra fields if present
        if hasattr(record, 'video_id'):
            log_data['video_id'] = record.video_id
        if hasattr(record, 'stage'):
            log_data['stage'] = record.stage
        if hasattr(record, 'duration'):
            log_data['duration'] = record.duration

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        return json.dumps(log_data)


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

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{color}{record.levelname:8}{self.RESET}"
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
    logger = logging.getLogger('video-translate')
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


# Convenience function for logging with extra context
def log_with_context(logger: logging.Logger, level: str, message: str, **context):
    """Log with extra context fields."""
    extra = {k: v for k, v in context.items()}
    record = logger.makeRecord(
        logger.name, getattr(logging, level.upper()),
        '', 0, message, (), None
    )
    for key, value in extra.items():
        setattr(record, key, value)
    logger.handle(record)
