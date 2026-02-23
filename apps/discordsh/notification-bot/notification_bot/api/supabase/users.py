"""
Users module for managing user provider relationships
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, UUID4
from .supabase_service import supabase_conn
from notification_bot.utils.logger import logger


# Pydantic Models for User Provider Operations
class UserProvider(BaseModel):
    """Model for user provider relationship"""
    id: UUID4
    user_id: UUID4
    provider: str
    provider_id: str
    created_at: datetime
    updated_at: datetime


class UserProviderCreate(BaseModel):
    """Model for creating user provider relationship"""
    user_id: UUID4
    provider: str = Field(..., description="Provider name (discord, github, google, etc.)")
    provider_id: str = Field(..., description="External provider ID")


class UserProfile(BaseModel):
    """Model for user profile with provider data"""
    user_id: UUID4
    email: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    full_name: Optional[str] = None
    provider: str
    provider_id: str
    provider_linked_at: datetime
    last_sign_in: Optional[datetime] = None


class UserAllProviders(BaseModel):
    """Model for user with all their linked providers"""
    user_id: UUID4
    providers: List[Dict[str, Any]]


class SyncResult(BaseModel):
    """Model for provider sync operation result"""
    success: bool
    synced_providers: List[str]
    total_synced: int
    error: Optional[str] = None


class UserManager:
    """Optimized manager class for user provider operations"""

    def __init__(self, supabase_service=None):
        self._supabase = supabase_service or supabase_conn

    async def find_user_by_discord_id(self, discord_id: str) -> Optional[UserProfile]:
        """
        Find user by their Discord ID

        Args:
            discord_id: Discord user ID

        Returns:
            UserProfile or None if not found
        """
        try:
            client = self._supabase.init_supabase_client()

            # Call RPC function with proper parameter - the function expects TEXT
            result = client.schema('tracker').rpc('find_user_by_discord_id', {
                'p_discord_id': str(discord_id)  # Ensure it's a string
            }).execute()

            if result.data and len(result.data) > 0:
                user_data = result.data[0]

                # The RPC returns specific columns matching our UserProfile
                return UserProfile(
                    user_id=user_data['user_id'],
                    email=user_data['email'] if user_data.get('email') else None,
                    username=user_data['discord_username'],  # Note: RPC returns 'discord_username'
                    avatar_url=user_data['discord_avatar'],  # Note: RPC returns 'discord_avatar'
                    full_name=user_data['full_name'],
                    provider='discord',
                    provider_id=discord_id,
                    provider_linked_at=user_data['created_at'],
                    last_sign_in=user_data['last_sign_in']
                )

            return None

        except Exception as e:
            logger.error(f"Error finding user by Discord ID {discord_id}: {e}")
            return None

    async def find_user_by_provider(
        self,
        provider: str,
        provider_id: str
    ) -> Optional[UserProfile]:
        """
        Find user by any provider

        Args:
            provider: Provider name (discord, github, etc.)
            provider_id: External provider ID

        Returns:
            UserProfile or None if not found
        """
        try:
            client = self._supabase.init_supabase_client()

            result = client.schema('tracker').rpc('find_user_by_provider', {
                'p_provider': provider,
                'p_provider_id': provider_id
            }).execute()

            if result.data and len(result.data) > 0:
                user_data = result.data[0]
                return UserProfile(
                    user_id=user_data['user_id'],
                    email=user_data['email'],
                    username=user_data['username'],
                    avatar_url=user_data['avatar_url'],
                    full_name=user_data['full_name'],
                    provider=provider,
                    provider_id=provider_id,
                    provider_linked_at=user_data['provider_linked_at'],
                    last_sign_in=user_data['last_sign_in']
                )

            return None

        except Exception as e:
            logger.error(f"Error finding user by {provider} ID {provider_id}: {e}")
            return None

    async def get_user_all_providers(self, user_id: str) -> Optional[UserAllProviders]:
        """
        Get all linked providers for a user

        Args:
            user_id: Supabase user UUID

        Returns:
            UserAllProviders or None if user not found
        """
        try:
            client = self._supabase.init_supabase_client()

            result = client.schema('tracker').rpc('get_user_all_providers', {
                'p_user_id': user_id
            }).execute()

            if result.data:
                providers = []
                for provider_data in result.data:
                    providers.append({
                        'provider': provider_data['provider'],
                        'provider_id': provider_data['provider_id'],
                        'linked_at': provider_data['linked_at'],
                        'username': provider_data['username'],
                        'email': provider_data['email'],
                        'avatar_url': provider_data['avatar_url']
                    })

                return UserAllProviders(
                    user_id=user_id,
                    providers=providers
                )

            return None

        except Exception as e:
            logger.error(f"Error getting all providers for user {user_id}: {e}")
            return None

    async def sync_user_provider_relationships(self, user_id: str) -> SyncResult:
        """
        Sync provider relationships from auth metadata

        Args:
            user_id: Supabase user UUID

        Returns:
            SyncResult with operation details
        """
        try:
            client = self._supabase.init_supabase_client()

            result = client.schema('tracker').rpc('sync_user_provider_relationships', {
                'p_user_id': user_id
            }).execute()

            if result.data and len(result.data) > 0:
                sync_data = result.data[0]
                return SyncResult(
                    success=True,
                    synced_providers=sync_data['synced_providers'] or [],
                    total_synced=sync_data['total_synced'] or 0
                )

            return SyncResult(
                success=True,
                synced_providers=[],
                total_synced=0
            )

        except Exception as e:
            logger.error(f"Error syncing provider relationships for user {user_id}: {e}")
            return SyncResult(
                success=False,
                synced_providers=[],
                total_synced=0,
                error=str(e)
            )

    async def link_user_provider(
        self,
        user_id: str,
        provider: str,
        provider_id: str
    ) -> Optional[str]:
        """
        Manually link a provider to a user

        Args:
            user_id: Supabase user UUID
            provider: Provider name
            provider_id: External provider ID

        Returns:
            Relationship ID or None if failed
        """
        try:
            client = self._supabase.init_supabase_client()

            result = client.schema('tracker').rpc('link_user_provider', {
                'p_user_id': user_id,
                'p_provider': provider,
                'p_provider_id': provider_id
            }).execute()

            if result.data:
                logger.info(f"Successfully linked {provider} ID {provider_id} to user {user_id}")
                return str(result.data)

            return None

        except Exception as e:
            logger.error(f"Error linking {provider} ID {provider_id} to user {user_id}: {e}")
            return None

    async def unlink_user_provider(self, user_id: str, provider: str) -> bool:
        """
        Unlink a provider from a user

        Args:
            user_id: Supabase user UUID
            provider: Provider name to unlink

        Returns:
            True if successful, False otherwise
        """
        try:
            client = self._supabase.init_supabase_client()

            result = client.schema('tracker').rpc('unlink_user_provider', {
                'p_user_id': user_id,
                'p_provider': provider
            }).execute()

            if result.data:
                success = result.data
                if success:
                    logger.info(f"Successfully unlinked {provider} from user {user_id}")
                else:
                    logger.warning(f"No {provider} provider found for user {user_id}")
                return success

            return False

        except Exception as e:
            logger.error(f"Error unlinking {provider} from user {user_id}: {e}")
            return False

    async def get_user_providers_list(self, user_id: str) -> List[UserProvider]:
        """
        Get all provider relationships for a user as UserProvider objects

        Args:
            user_id: Supabase user UUID

        Returns:
            List of UserProvider objects
        """
        try:
            client = self._supabase.init_supabase_client()

            result = (
                client.schema('tracker')
                .table('user_providers')
                .select('*')
                .eq('user_id', user_id)
                .execute()
            )

            providers = []
            if result.data:
                for provider_data in result.data:
                    providers.append(UserProvider(**provider_data))

            return providers

        except Exception as e:
            logger.error(f"Error getting provider list for user {user_id}: {e}")
            return []


# Global user manager instance
user_manager = UserManager()
