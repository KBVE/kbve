"""
Discord API package for managing bot operations and commands
"""
from .discord_singleton import (
    discord_bot,
    DiscordBotSingleton
)
from .embed import (
    BotStatusView,
    StatusControlButtons,
    send_bot_status_embed
)

__all__ = [
    'discord_bot',
    'DiscordBotSingleton',
    'BotStatusView',
    'StatusControlButtons',
    'send_bot_status_embed'
]