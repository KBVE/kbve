import re
from urllib.parse import urlparse, unquote

class Utils:
    @staticmethod
    def validate_url(value: str, allow_encoded: bool = False) -> str:
        """
        Validates and sanitizes a URL, rejecting any URLs with percent-encoded characters.

        Args:
            value (str): The input URL to validate.
            allow_encoded (bool): If True, allow encoded characters; otherwise, decode them.

        Returns:
            str: The validated and sanitized URL.

        Raises:
            ValueError: If the URL is invalid or contains unsafe content.
        """
        if not value:
            raise ValueError("URL cannot be empty.")
        # If encoded characters are not allowed, ensure no '%' character is present
        if '%' in value:
            raise ValueError(f"URL contains percent-encoded characters, which are not allowed: {value}")
        # Decode the URL if encoded characters are not allowed
        if not allow_encoded:
            value = unquote(value)
        # Parse the URL
        parsed = urlparse(value)
        # Check for valid scheme and netloc
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"Invalid URL structure: {value}")
        # Ensure the scheme is HTTP or HTTPS
        if parsed.scheme not in {"http", "https"}:
            raise ValueError(f"URL must start with http:// or https://. Got: {value}")
        # Check if the netloc (domain) is not just a single character or empty
        if len(parsed.netloc) < 3 or '.' not in parsed.netloc:
            raise ValueError(f"Invalid URL domain: {value}")
        # Check if the netloc is just a scheme (like "https://")
        if parsed.netloc == "":
            raise ValueError(f"Invalid URL, missing domain: {value}")
        # Additional sanitization (remove unsafe characters)
        sanitized_url = re.sub(r'[^a-zA-Z0-9:/?&=_\-.,]', '', value)
        if sanitized_url != value:
            raise ValueError(f"URL contains unsafe characters: {value}")
        return sanitized_url
