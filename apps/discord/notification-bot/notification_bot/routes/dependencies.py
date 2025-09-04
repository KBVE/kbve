from fastapi import FastAPI, Security
from contextlib import asynccontextmanager
import logging
import asyncio
from notification_bot.api.supabase import supabase_conn
from notification_bot.api.discordbot import discord_bot

logger = logging.getLogger("uvicorn")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Preparing FastAPI Lifespan")
    
    # Initialize connections on startup
    discord_task = None
    try:
        # Initialize Supabase client
        supabase_conn.init_supabase_client()
        logger.info("Supabase client initialized")
        
        # Initialize Discord bot
        await discord_bot.initialize_bot()
        logger.info("Discord bot initialized")
        
        # Start Discord bot in background task
        discord_task = asyncio.create_task(discord_bot.start_bot())
        logger.info("Discord bot started in background")
        
        # Initialize PostgreSQL pool
        # await supabase_conn.init_postgres_pool()
        # logger.info("PostgreSQL pool initialized")
        
    except Exception as e:
        logger.error(f"Failed to initialize connections: {e}")
        # Clean up Discord bot if it was started
        if discord_task and not discord_task.done():
            discord_task.cancel()
        await discord_bot.stop_bot()
        raise
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down FastAPI Lifespan")
    
    # Stop Discord bot
    if discord_task and not discord_task.done():
        discord_task.cancel()
        try:
            await discord_task
        except asyncio.CancelledError:
            logger.info("Discord bot task cancelled")
    
    await discord_bot.stop_bot()
    await supabase_conn.close()

