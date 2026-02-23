from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
from dishka import AsyncContainer
from ..api.supabase.supabase_service import SupabaseService
from ..api.discord.discord_service import DiscordBotService
from .logger import logger

# Global container reference for lifespan management
_container: AsyncContainer = None


def set_container(container: AsyncContainer):
    """Set the global container for lifespan management"""
    global _container
    _container = container


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Preparing FastAPI Lifespan")

    # Use the global container reference
    container = _container
    if not container:
        logger.error("Dishka container not set")
        raise RuntimeError("Dishka container not available")

    # Initialize connections on startup
    discord_task = None
    try:
        # Get services from Dishka async container with proper scope management
        async with container() as request_container:
            supabase_conn = await request_container.get(SupabaseService)
            discord_bot = await request_container.get(DiscordBotService)

            # Initialize Supabase client
            supabase_conn.init_supabase_client()
            logger.info("Supabase client initialized")

            # Initialize Discord bot
            await discord_bot.initialize_bot()
            logger.info("Discord bot initialized")

            # Start Discord bot in background task
            async def start_bot_wrapper():
                try:
                    logger.info("Background task starting Discord bot...")
                    await discord_bot.start_bot()
                    logger.info("Discord bot background task completed")
                except Exception as e:
                    logger.error(f"Discord bot background task failed: {e}")
                    import traceback
                    logger.error(f"Full traceback: {traceback.format_exc()}")

            discord_task = asyncio.create_task(start_bot_wrapper())
            logger.info("Discord bot started in background task")

    except Exception as e:
        logger.error(f"Failed to initialize connections: {e}")
        # Clean up Discord bot if it was started
        if discord_task and not discord_task.done():
            discord_task.cancel()
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

    # Get services for cleanup
    try:
        async with container() as request_container:
            discord_bot = await request_container.get(DiscordBotService)
            supabase_conn = await request_container.get(SupabaseService)

            await discord_bot.stop_bot(send_message=False)  # Don't send message again if sign-off already sent it
            await supabase_conn.close()
    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
