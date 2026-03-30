import logging as _logging

_logger = _logging.getLogger(__name__)

from .runelite import RuneLiteClient  # noqa: F401, E402

try:
    from .screen_client import ScreenClient  # noqa: F401, E402
except (ImportError, KeyError):
    # KeyError: 'DISPLAY' raised by pyautogui/mouseinfo on headless CI
    _logger.debug("ScreenClient unavailable — install fudster[automation]")

try:
    from .chrome_client import ChromeClient  # noqa: F401, E402
except ImportError:
    _logger.debug("ChromeClient unavailable — install fudster[browser]")

try:
    from .discord_client import DiscordClient  # noqa: F401, E402
except ImportError:
    _logger.debug("DiscordClient unavailable — install fudster[browser]")

try:
    from .novnc_client import NoVNCClient  # noqa: F401, E402
except ImportError:
    _logger.debug("NoVNCClient unavailable — install fudster[vnc]")
