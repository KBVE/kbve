"""
Type aliases for dependency injection to reduce typing overhead
"""
from dishka.integrations.fastapi import FromDishka
from .api.discord.discord_service import DiscordBotService
from .api.supabase.supabase_service import SupabaseService
from .api.supabase.vault import VaultManager
from .api.supabase.tracker import TrackerManager
from .api.supabase.users import UserManager
from .utils.health_monitor import HealthMonitor

# Core service type aliases
BotService = FromDishka[DiscordBotService]
DbService = FromDishka[SupabaseService] 
Monitor = FromDishka[HealthMonitor]

# Manager type aliases
Vault = FromDishka[VaultManager]
Tracker = FromDishka[TrackerManager]
Users = FromDishka[UserManager]