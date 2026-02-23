"""
Core providers for Discord bot and Supabase client
"""
from dishka import Provider, Scope, provide
from ..api.discord.discord_service import DiscordBotService
from ..api.supabase.supabase_service import SupabaseService


class CoreProvider(Provider):
    """Optimized provider for core services"""
    
    @provide(scope=Scope.APP)
    def discord_bot(self) -> DiscordBotService:
        return DiscordBotService()
    
    @provide(scope=Scope.APP)
    def supabase_service(self) -> SupabaseService:
        return SupabaseService()