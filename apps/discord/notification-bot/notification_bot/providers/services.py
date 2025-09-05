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
    scope = Scope.SINGLETON
    
    @provide
    def vault_manager(self, supabase_service: SupabaseService) -> VaultManager:
        return VaultManager(supabase_service)
    
    @provide  
    def tracker_manager(self, supabase_service: SupabaseService) -> TrackerManager:
        return TrackerManager(supabase_service)
        
    @provide
    def user_manager(self, supabase_service: SupabaseService) -> UserManager:
        return UserManager(supabase_service)