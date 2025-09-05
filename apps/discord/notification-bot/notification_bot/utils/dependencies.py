from fastapi import FastAPI, Security
from contextlib import asynccontextmanager
import logging
import asyncio
from notification_bot.api.supabase import supabase_conn
from notification_bot.api.discord import discord_bot

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
        async def start_bot_wrapper():
            try:
                logger.info("🚀 Background task starting Discord bot...")
                await discord_bot.start_bot()
                logger.info("✅ Discord bot background task completed")
            except Exception as e:
                logger.error(f"❌ Discord bot background task failed: {e}")
                import traceback
                logger.error(f"Full traceback: {traceback.format_exc()}")
        
        discord_task = asyncio.create_task(start_bot_wrapper())
        logger.info("Discord bot started in background task")
        
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
    
    await discord_bot.stop_bot(send_message=False)  # Don't send message again if sign-off already sent it
    await supabase_conn.close()

