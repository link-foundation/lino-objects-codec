"""Shared release badge recognition."""

import re
from urllib.parse import urlsplit


def has_shields_badge(body: str) -> bool:
    """Recognize an image from the exact HTTPS Shields origin."""
    for match in re.finditer(r"!\[[^\]!\r\n]*\]\((https?://[^\s)]+)\)", body):
        try:
            url = urlsplit(match[1])
            if url.scheme == "https" and url.netloc == "img.shields.io":
                return True
        except ValueError:
            continue
    return False
