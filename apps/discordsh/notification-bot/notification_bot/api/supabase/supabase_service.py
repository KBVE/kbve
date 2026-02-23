"""
Core Supabase client service for managing database connections
"""
import os
from typing import NamedTuple, Optional, Any
from supabase import create_client, Client
from notification_bot.utils.logger import logger


class QueryResult(NamedTuple):
    """Result from executing a Supabase query"""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


class SupabaseService:
    """Service class for managing Supabase client connection"""

    def __init__(self):
        self.supabase_url = os.getenv("SUPABASE_URL")
        self.supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.client: Optional[Client] = None

    def init_supabase_client(self) -> Client:
        """Initialize Supabase client with service role key"""
        if not self.client:
            if not self.supabase_url or not self.supabase_service_key:
                raise ValueError("Supabase URL and service role key are required")
            self.client = create_client(self.supabase_url, self.supabase_service_key)
            logger.info("Supabase service client initialized with service role key")
        return self.client

    async def close(self):
        """Placeholder for cleanup - Supabase client doesn't need explicit closing"""
        logger.info("Supabase client cleanup completed")

    async def execute_query(self, query) -> QueryResult:
        """
        Execute a Supabase query and return result

        Args:
            query: A Supabase query builder object

        Returns:
            QueryResult with success, data, and error attributes
        """
        try:
            # Ensure client is initialized
            _ = self.init_supabase_client()
            response = query.execute()

            if hasattr(response, 'error') and response.error:
                return QueryResult(success=False, data=None, error=str(response.error))

            data = response.data if hasattr(response, 'data') else response
            return QueryResult(success=True, data=data, error=None)

        except Exception as e:
            logger.error(f"Query execution error: {e}")
            return QueryResult(success=False, data=None, error=str(e))


# Legacy global instance - use Dishka injection instead
supabase_conn = SupabaseService()
SupabaseConnection = SupabaseService  # Alias for compatibility


def get_supabase_client() -> Client:
    """Legacy dependency to get Supabase client"""
    return supabase_conn.init_supabase_client()
