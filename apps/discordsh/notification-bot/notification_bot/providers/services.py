"""
Service providers for Supabase managers
"""
from dishka import Provider, Scope, provide
from ..api.supabase.vault import VaultManager
from ..api.supabase.tracker import TrackerManager
from ..api.supabase.users import UserManager
from ..api.supabase.supabase_service import SupabaseService


class ServicesProvider(Provider):
    """Optimized provider for Supabase service managers with dependency injection"""

    @provide(scope=Scope.APP)
    def vault_manager(self, supabase_service: SupabaseService) -> VaultManager:
        return VaultManager(supabase_service)

    @provide(scope=Scope.APP)
    def tracker_manager(self, supabase_service: SupabaseService) -> TrackerManager:
        return TrackerManager(supabase_service)

    @provide(scope=Scope.APP)
    def user_manager(self, supabase_service: SupabaseService) -> UserManager:
        return UserManager(supabase_service)
