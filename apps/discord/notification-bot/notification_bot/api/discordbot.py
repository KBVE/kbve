import discord
import logging
import asyncio
from typing import Optional
from .supabase import supabase_conn

logger = logging.getLogger("uvicorn")


class DiscordBotSingleton:
    """Singleton Discord bot instance"""
    
    _instance = None
    _bot: Optional[discord.Client] = None
    _token: Optional[str] = None
    _is_starting: bool = False
    _is_stopping: bool = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DiscordBotSingleton, cls).__new__(cls)
            cls._instance._is_starting = False
            cls._instance._is_stopping = False
        return cls._instance
    
    async def initialize_bot(self) -> discord.Client:
        """Initialize the Discord bot with token from vault"""
        if self._bot is not None:
            return self._bot
        
        try:
            # Get Discord token from vault
            secret_id = "39781c47-be8f-4a10-ae3a-714da299ca07"
            result = await supabase_conn.get_vault_secret(secret_id)
            
            if not result.success:
                raise Exception(f"Failed to retrieve Discord token: {result.error}")
            
            # Extract the token from the secret data
            secret_data = result.data
            if not secret_data or 'decrypted_secret' not in secret_data:
                raise Exception("Discord token not found in vault secret")
            
            self._token = secret_data['decrypted_secret']
            
            # Create Discord bot with intents
            intents = discord.Intents.default()
            intents.message_content = True  # Enable message content intent
            intents.guilds = True
            intents.guild_messages = True
            
            self._bot = discord.Client(intents=intents)
            
            # Set up event handlers
            self._setup_event_handlers()
            
            logger.info("Discord bot initialized successfully")
            return self._bot
            
        except Exception as e:
            logger.error(f"Failed to initialize Discord bot: {e}")
            raise
    
    def _setup_event_handlers(self):
        """Set up Discord bot event handlers"""
        if not self._bot:
            return
        
        @self._bot.event
        async def on_ready():
            logger.info(f"🟢 ON_READY EVENT TRIGGERED! Bot logged in as {self._bot.user}")
            logger.info(f"Bot is in {len(self._bot.guilds)} guilds")
            for guild in self._bot.guilds:
                logger.info(f"  - Guild: {guild.name} (ID: {guild.id})")
            
            # Send interactive status embed to the specified thread
            try:
                logger.info("Attempting to send status embed...")
                result = await self._send_status_embed()
                if result:
                    logger.info(f"Status embed sent successfully: {result.id}")
                else:
                    logger.warning("Status embed was not sent (returned None)")
            except Exception as e:
                logger.error(f"Error sending status embed in on_ready: {e}")
                # Fallback to simple message
                try:
                    await self._send_simple_status_message("🟢 **Bot is now ONLINE** - Ready to receive notifications!")
                    logger.info("Sent fallback simple message instead")
                except Exception as e2:
                    logger.error(f"Even fallback message failed: {e2}")
        
        @self._bot.event
        async def on_connect():
            logger.info("🔗 Bot connected to Discord")
        
        @self._bot.event  
        async def on_disconnect():
            logger.info("🔌 Bot disconnected from Discord")
        
        @self._bot.event
        async def on_resumed():
            logger.info("🔄 Bot resumed connection")
        
        @self._bot.event
        async def on_error(event, *args, **kwargs):
            logger.error(f"Discord bot error in event {event}: {args}, {kwargs}")
    
    async def _send_status_embed(self):
        """Send an interactive status embed to the specified thread"""
        try:
            thread_id = 1413056068392714260
            logger.info(f"Looking for thread {thread_id}")
            
            thread = self._bot.get_channel(thread_id)
            logger.info(f"get_channel result: {thread}")
            
            if not thread:
                logger.info("Thread not in cache, fetching from API...")
                # Try to fetch the thread if not in cache
                thread = await self._bot.fetch_channel(thread_id)
                logger.info(f"fetch_channel result: {thread}")
            
            if thread:
                logger.info(f"Found thread: {thread.name if hasattr(thread, 'name') else thread}")
                # Import here to avoid circular imports
                from ..models.embed import send_bot_status_embed
                logger.info("Calling send_bot_status_embed...")
                message = await send_bot_status_embed(thread, self)
                logger.info(f"Status embed sent to thread {thread_id}, message ID: {message.id if message else 'None'}")
                return message
            else:
                logger.error(f"Could not find thread with ID {thread_id} after both get_channel and fetch_channel")
                return None
                
        except Exception as e:
            logger.error(f"Failed to send status embed: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    
    async def _send_simple_status_message(self, message: str):
        """Send a simple text status message (fallback)"""
        try:
            thread_id = 1413056068392714260
            thread = self._bot.get_channel(thread_id)
            
            if not thread:
                # Try to fetch the thread if not in cache
                thread = await self._bot.fetch_channel(thread_id)
            
            if thread:
                await thread.send(message)
                logger.info(f"Status message sent to thread {thread_id}: {message}")
            else:
                logger.error(f"Could not find thread with ID {thread_id}")
                
        except Exception as e:
            logger.error(f"Failed to send status message: {e}")
    
    async def send_offline_message(self):
        """Send offline message before shutting down"""
        if self._bot and self._bot.is_ready():
            await self._send_simple_status_message("🔴 **Bot is going OFFLINE** - Shutting down gracefully...")
    
    async def start_bot(self):
        """Start the Discord bot with safeguards"""
        if self._is_starting:
            logger.warning("Bot is already starting, please wait...")
            return
        
        if self._bot and not self._bot.is_closed():
            logger.warning("Bot is already running but not ready - forcing restart")
            logger.info(f"Current bot state: ready={self._bot.is_ready()}, closed={self._bot.is_closed()}")
            # Force close the stuck bot
            try:
                await self._bot.close()
                await asyncio.sleep(1)
            except:
                pass
            self._bot = None
        
        self._is_starting = True
        try:
            if not self._bot:
                logger.info("Bot not initialized, initializing...")
                await self.initialize_bot()
            
            if not self._token:
                raise Exception("Discord token not available")
            
            logger.info(f"Starting Discord bot with token: {self._token[:10]}...")
            logger.info(f"Bot intents: {self._bot.intents}")
            logger.info(f"Bot user before start: {self._bot.user}")
            
            # Start with timeout to prevent hanging
            try:
                await asyncio.wait_for(self._bot.start(self._token), timeout=30.0)
                logger.info("Bot.start() completed successfully")
            except asyncio.TimeoutError:
                logger.error("Bot.start() timed out after 30 seconds")
                raise Exception("Bot connection timed out")
            
        except Exception as e:
            logger.error(f"Failed to start Discord bot: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise
        finally:
            self._is_starting = False
    
    async def stop_bot(self, send_message: bool = True):
        """Stop the Discord bot with safeguards"""
        if self._is_stopping:
            logger.warning("Bot is already stopping, please wait...")
            return
        
        if not self._bot or self._bot.is_closed():
            logger.info("Discord bot already stopped or not initialized")
            return
        
        self._is_stopping = True
        try:
            # Send offline message before closing (unless already sent)
            if send_message:
                await self.send_offline_message()
                # Give a moment for the message to send
                await asyncio.sleep(1)
            
            await self._bot.close()
            logger.info("Discord bot stopped")
        except Exception as e:
            logger.error(f"Error stopping Discord bot: {e}")
        finally:
            self._is_stopping = False
    
    def get_bot(self) -> Optional[discord.Client]:
        """Get the bot instance if initialized"""
        return self._bot
    
    def is_ready(self) -> bool:
        """Check if bot is ready"""
        return self._bot is not None and self._bot.is_ready()
    
    def get_status(self) -> dict:
        """Get detailed bot status"""
        return {
            "initialized": self._bot is not None,
            "is_ready": self.is_ready(),
            "is_closed": self._bot.is_closed() if self._bot else True,
            "is_starting": self._is_starting,
            "is_stopping": self._is_stopping,
            "guild_count": len(self._bot.guilds) if self._bot and self._bot.is_ready() else 0
        }
    
    async def restart_bot(self):
        """Safely restart the Discord bot"""
        if self._is_starting or self._is_stopping:
            raise Exception("Bot is currently starting or stopping, cannot restart")
        
        logger.info("Restarting Discord bot...")
        
        # Send a restart notification first
        if self._bot and self._bot.is_ready():
            await self._send_simple_status_message("🔄 **Bot is RESTARTING** - Please wait...")
        
        # Stop the bot first (without sending offline message)
        await self.stop_bot(send_message=False)
        
        # Wait a moment for cleanup
        await asyncio.sleep(2)
        
        # Reinitialize the bot (get fresh token and client)
        self._bot = None
        await self.initialize_bot()
        
        # Start the bot again (this will send the status embed via on_ready)
        await self.start_bot()
        
        logger.info("Discord bot restarted successfully")
    
    async def bring_online(self):
        """Bring the bot online if it's offline"""
        if self._is_starting:
            raise Exception("Bot is already starting")
        
        if self._bot and not self._bot.is_closed():
            raise Exception("Bot is already online")
        
        logger.info("Bringing Discord bot online...")
        await self.start_bot()  # This will send the status embed via on_ready


# Global instance
discord_bot = DiscordBotSingleton()


async def get_discord_bot() -> discord.Client:
    """Dependency to get Discord bot instance"""
    return await discord_bot.initialize_bot()


async def start_discord_bot():
    """Start the Discord bot (for use in startup)"""
    await discord_bot.start_bot()


async def stop_discord_bot():
    """Stop the Discord bot (for use in shutdown)"""
    await discord_bot.stop_bot()