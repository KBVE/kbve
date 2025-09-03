import os
import logging
from typing import Optional
from supabase import create_client, Client

logger = logging.getLogger("uvicorn")

class SupabaseConnection:
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

# Global instance
supabase_conn = SupabaseConnection()

def get_supabase_client() -> Client:
    """Dependency to get Supabase client"""
    return supabase_conn.init_supabase_client()