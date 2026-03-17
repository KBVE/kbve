"""Fudster - A composable ML library for haystack-ai and pgvector integrations."""

import logging as _logging

_logger = _logging.getLogger(__name__)

# Broadcast models
from .models import (  # noqa: F401, E402
    CommandModel, LoggerModel, BroadcastModel, KBVELoginModel, HandshakeModel, model_map,
)

# API models
from .models.rss import RssItem, RssFeed  # noqa: F401, E402
from .models.poem import PoemDB  # noqa: F401, E402
from .models.coindesk import CoinDeskAPIResponse  # noqa: F401, E402
from .models.groq import AiGroqPayload, GroqResponse  # noqa: F401, E402
from .models.rsps import GameEvent, GameStat, GameInventory  # noqa: F401, E402

# Core API
from .api import Routes, CORS, WS, APIConnector  # noqa: F401, E402

# API clients
from .api.clients import CoinDeskClient, PoetryDBClient, GroqClient, WebsocketEchoClient  # noqa: F401, E402

# API utils
from .api.utils import RSSUtility, KRDecorator, DynamicEndpoint  # noqa: F401, E402

try:
    from .api.utils import ImageUtility  # noqa: F401, E402
except ImportError:
    _logger.debug("ImageUtility unavailable — install fudster[image] for image processing support")

# Apps
from .apps import RuneLiteClient  # noqa: F401, E402

try:
    from .apps import ScreenClient, ChromeClient, DiscordClient, NoVNCClient  # noqa: F401, E402
except ImportError:
    _logger.debug("Optional app clients unavailable — install fudster[browser,automation,vnc] as needed")

__version__ = "0.1.0"
