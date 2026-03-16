"""
Centralized logger configuration for compatibility with different ASGI servers
Works with both Uvicorn and Granian
"""
import logging
import sys
import os


# Configure root logger for the application
def setup_logging():
    """Configure logging for the entire application"""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    # Configure the root logger
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        stream=sys.stdout
    )


# Setup logging on import
setup_logging()


# For backward compatibility and easy migration
def get_logger(name: str = __name__) -> logging.Logger:
    """
    Get a logger instance. Uses standard Python logging.

    Args:
        name: Logger name (defaults to module name)

    Returns:
        Logger instance
    """
    return logging.getLogger(name)


# Create a default app logger instance
logger = logging.getLogger("app")


def sanitize_log(value: str) -> str:
    """
    Sanitize a user-provided value for safe inclusion in log messages.
    Strips newlines and carriage returns to prevent log injection (CWE-117).
    """
    if not isinstance(value, str):
        value = str(value)
    return value.replace('\n', '').replace('\r', '')
