import discord
import logging
from typing import Optional
from .supabase import supabase_conn

logger = logging.getLogger("uvicorn")


class DiscordBotSingleton:
    """Singleton Discord bot instance"""
    
    _instance = None
    _bot: Optional[discord.Client] = None
    _token: Optional[str] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DiscordBotSingleton, cls).__new__(cls)
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
            logger.info(f"Discord bot logged in as {self._bot.user}")
            logger.info(f"Bot is in {len(self._bot.guilds)} guilds")
        
        @self._bot.event
        async def on_error(event, *args, **kwargs):
            logger.error(f"Discord bot error in event {event}: {args}, {kwargs}")
    
    async def start_bot(self):
        """Start the Discord bot"""
        if not self._bot:
            await self.initialize_bot()
        
        if not self._token:
            raise Exception("Discord token not available")
        
        try:
            await self._bot.start(self._token)
        except Exception as e:
            logger.error(f"Failed to start Discord bot: {e}")
            raise
    
    async def stop_bot(self):
        """Stop the Discord bot"""
        if self._bot and not self._bot.is_closed():
            await self._bot.close()
            logger.info("Discord bot stopped")
    
    def get_bot(self) -> Optional[discord.Client]:
        """Get the bot instance if initialized"""
        return self._bot
    
    def is_ready(self) -> bool:
        """Check if bot is ready"""
        return self._bot is not None and self._bot.is_ready()


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