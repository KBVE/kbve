"""Fudster - A composable ML library for haystack-ai and pgvector integrations."""

# Broadcast models
from .models import CommandModel, LoggerModel, BroadcastModel, KBVELoginModel, HandshakeModel, model_map  # noqa: F401

# API models
from .models.rss import RssItem, RssFeed  # noqa: F401
from .models.poem import PoemDB  # noqa: F401
from .models.coindesk import CoinDeskAPIResponse  # noqa: F401
from .models.groq import AiGroqPayload, GroqResponse  # noqa: F401
from .models.rsps import GameEvent, GameStat, GameInventory  # noqa: F401

# Core API
from .api import Routes, CORS, WS, APIConnector  # noqa: F401

# API clients
from .api.clients import CoinDeskClient, PoetryDBClient, GroqClient, WebsocketEchoClient  # noqa: F401

# API utils
from .api.utils import RSSUtility, KRDecorator, DynamicEndpoint  # noqa: F401

try:
    from .api.utils import ImageUtility  # noqa: F401
except ImportError:
    pass

# Apps
from .apps import RuneLiteClient  # noqa: F401

try:
    from .apps import ScreenClient, ChromeClient, DiscordClient, NoVNCClient  # noqa: F401
except ImportError:
    pass

__version__ = "0.1.0"
