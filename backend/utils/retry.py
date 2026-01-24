"""
Retry Decorator Utility

Provides exponential backoff retry logic for flaky operations
like network requests, API calls, and file operations.
"""

import time
import logging
import functools
from typing import Callable, Tuple, Type, Optional, Any

logger = logging.getLogger('subtide')


def retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    on_retry: Optional[Callable[[Exception, int], None]] = None,
    log_retries: bool = True
) -> Callable:
    """
    Retry decorator with exponential backoff.

    Args:
        max_attempts: Maximum number of attempts (default: 3)
        delay: Initial delay between retries in seconds (default: 1.0)
        backoff: Multiplier for delay after each retry (default: 2.0)
        exceptions: Tuple of exception types to catch and retry (default: all)
        on_retry: Optional callback called on each retry (receives exception and attempt number)
        log_retries: Whether to log retry attempts (default: True)

    Returns:
        Decorated function with retry logic

    Example:
        @retry(max_attempts=3, delay=1.0, exceptions=(requests.RequestException,))
        def fetch_data(url):
            return requests.get(url)

        @retry(max_attempts=5, backoff=1.5, exceptions=(TimeoutError, ConnectionError))
        def connect_to_service():
            return service.connect()
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            current_delay = delay

            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e

                    if attempt == max_attempts:
                        if log_retries:
                            logger.error(
                                f"[RETRY] {func.__name__} failed after {max_attempts} attempts: {e}"
                            )
                        raise

                    if log_retries:
                        logger.warning(
                            f"[RETRY] {func.__name__} attempt {attempt}/{max_attempts} failed: {e}. "
                            f"Retrying in {current_delay:.1f}s..."
                        )

                    if on_retry:
                        on_retry(e, attempt)

                    time.sleep(current_delay)
                    current_delay *= backoff

            # Should never reach here, but just in case
            raise last_exception

        return wrapper
    return decorator


def retry_async(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    on_retry: Optional[Callable[[Exception, int], None]] = None,
    log_retries: bool = True
) -> Callable:
    """
    Async version of retry decorator with exponential backoff.

    Same parameters as retry(), but for async functions.

    Example:
        @retry_async(max_attempts=3, exceptions=(aiohttp.ClientError,))
        async def fetch_data(url):
            async with aiohttp.ClientSession() as session:
                return await session.get(url)
    """
    import asyncio

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            last_exception = None
            current_delay = delay

            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e

                    if attempt == max_attempts:
                        if log_retries:
                            logger.error(
                                f"[RETRY] {func.__name__} failed after {max_attempts} attempts: {e}"
                            )
                        raise

                    if log_retries:
                        logger.warning(
                            f"[RETRY] {func.__name__} attempt {attempt}/{max_attempts} failed: {e}. "
                            f"Retrying in {current_delay:.1f}s..."
                        )

                    if on_retry:
                        on_retry(e, attempt)

                    await asyncio.sleep(current_delay)
                    current_delay *= backoff

            raise last_exception

        return wrapper
    return decorator


class RetryContext:
    """
    Context manager for retry logic.

    Example:
        with RetryContext(max_attempts=3, delay=1.0) as retry_ctx:
            for attempt in retry_ctx:
                try:
                    result = risky_operation()
                    break
                except TemporaryError as e:
                    retry_ctx.record_failure(e)
    """

    def __init__(
        self,
        max_attempts: int = 3,
        delay: float = 1.0,
        backoff: float = 2.0,
        exceptions: Tuple[Type[Exception], ...] = (Exception,)
    ):
        self.max_attempts = max_attempts
        self.delay = delay
        self.backoff = backoff
        self.exceptions = exceptions
        self.attempt = 0
        self.last_exception = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        return False

    def __iter__(self):
        self.attempt = 0
        return self

    def __next__(self):
        self.attempt += 1
        if self.attempt > self.max_attempts:
            if self.last_exception:
                raise self.last_exception
            raise StopIteration
        return self.attempt

    def record_failure(self, exception: Exception):
        """Record a failed attempt and sleep before next retry."""
        self.last_exception = exception
        if self.attempt < self.max_attempts:
            sleep_time = self.delay * (self.backoff ** (self.attempt - 1))
            logger.warning(
                f"[RETRY] Attempt {self.attempt}/{self.max_attempts} failed: {exception}. "
                f"Retrying in {sleep_time:.1f}s..."
            )
            time.sleep(sleep_time)
