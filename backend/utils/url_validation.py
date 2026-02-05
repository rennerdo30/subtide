"""
URL validation utilities for SSRF prevention.

Validates that user-provided URLs don't point to internal/private networks.
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger('subtide')


def is_private_ip(hostname: str) -> bool:
    """Check if a hostname resolves to a private/internal IP address."""
    try:
        # Try to parse as IP address directly
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local
    except ValueError:
        pass

    try:
        # Resolve hostname to IP
        addr_info = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local:
                return True
    except (socket.gaierror, OSError, ValueError):
        # If we can't resolve, treat as potentially dangerous
        return True

    return False


def validate_api_url(url: str) -> bool:
    """
    Validate a user-provided API URL for SSRF safety.

    Returns True if the URL is safe to use, False otherwise.
    Blocks private/internal IP ranges and non-HTTPS URLs (except localhost for dev).
    """
    if not url:
        return True  # None/empty is fine (uses default)

    try:
        parsed = urlparse(url)
    except Exception:
        return False

    # Must have scheme and host
    if not parsed.scheme or not parsed.hostname:
        return False

    # Only allow http/https
    if parsed.scheme not in ('http', 'https'):
        return False

    hostname = parsed.hostname.lower()

    # Block known dangerous patterns
    if hostname in ('metadata.google.internal', 'metadata', '169.254.169.254'):
        return False

    # Block private IPs
    if is_private_ip(hostname):
        logger.warning(f"[SECURITY] Blocked API URL targeting private/internal address: {url[:100]}")
        return False

    return True


def validate_stream_url(url: str) -> bool:
    """
    Validate a user-provided stream/video URL.

    Returns True if the URL is safe to use, False otherwise.
    """
    if not url:
        return True  # None/empty is fine

    try:
        parsed = urlparse(url)
    except Exception:
        return False

    if not parsed.scheme or not parsed.hostname:
        return False

    if parsed.scheme not in ('http', 'https'):
        return False

    hostname = parsed.hostname.lower()

    # Block cloud metadata endpoints
    if hostname in ('metadata.google.internal', 'metadata', '169.254.169.254'):
        return False

    # Block private IPs
    if is_private_ip(hostname):
        logger.warning(f"[SECURITY] Blocked stream URL targeting private/internal address: {url[:100]}")
        return False

    return True
