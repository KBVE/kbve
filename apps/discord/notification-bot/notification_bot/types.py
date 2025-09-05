"""
Type aliases for dependency injection to reduce typing overhead
"""
from typing import Annotated
from dishka.integrations.fastapi import FromDishka
from .api.discord.discord_service import DiscordBotService
from .api.supabase.supabase_service import SupabaseService
from .api.supabase.vault import VaultManager
from .api.supabase.tracker import TrackerManager
from .api.supabase.users import UserManager
from .utils.health_monitor import HealthMonitor

# Simplified type aliases - back to original FromDishka syntax
BotService = Annotated[DiscordBotService, FromDishka()]
DbService = Annotated[SupabaseService, FromDishka()] 
Monitor = Annotated[HealthMonitor, FromDishka()]

# Manager type aliases
Vault = Annotated[VaultManager, FromDishka()]
Tracker = Annotated[TrackerManager, FromDishka()]
Users = Annotated[UserManager, FromDishka()]