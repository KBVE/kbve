from fastapi import FastAPI, Security
from contextlib import asynccontextmanager
import logging
from notification_bot.api.supabase import supabase_conn

logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Preparing FastAPI Lifespan")
    
    # Initialize connections on startup
    try:
        # Initialize Supabase client
        supabase_conn.init_supabase_client()
        logger.info("Supabase client initialized")
        
        # Initialize PostgreSQL pool
        # await supabase_conn.init_postgres_pool()
        # logger.info("PostgreSQL pool initialized")
        
    except Exception as e:
        logger.error(f"Failed to initialize connections: {e}")
        raise
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down FastAPI Lifespan")
    await supabase_conn.close()

