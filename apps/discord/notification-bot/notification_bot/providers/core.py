"""
Core providers for Discord bot and Supabase client
"""
from dishka import Provider, Scope, provide
from ..api.discord.discord_service import DiscordBotService
from ..api.supabase.supabase_service import SupabaseService


class CoreProvider(Provider):
    """Optimized provider for core services"""
    scope = Scope.SINGLETON
    
    discord_bot = provide(DiscordBotService)
    supabase_service = provide(SupabaseService)