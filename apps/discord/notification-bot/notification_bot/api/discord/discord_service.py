"""
Discord bot service for managing core bot operations
"""
import discord
import logging
import asyncio
from typing import Optional
from ..supabase import vault_manager, tracker_manager
from ...models.constants import DISCORD_THREAD_ID, DEFAULT_CLEANUP_LIMIT, VERSION
import os
import uuid

logger = logging.getLogger("uvicorn")


class DiscordBotService:
    """Discord bot service managed by Dishka"""
    
    def __init__(self):
        self._bot: Optional[discord.Client] = None
        self._token: Optional[str] = None
        self._is_starting: bool = False
        self._is_stopping: bool = False
        self._last_status_message_id: Optional[int] = None
    
    async def initialize_bot(self) -> discord.Client:
        """Initialize the Discord bot with token from vault"""
        if self._bot is not None:
            return self._bot
        
        try:
            # Get Discord token from vault
            secret_id = "39781c47-be8f-4a10-ae3a-714da299ca07"
            result = await vault_manager.get_vault_secret(secret_id)
            
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
            
            # For cross-cluster deployments, use distributed shard coordination via Supabase
            # Get instance ID for this deployment
            instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
            cluster_name = os.getenv('CLUSTER_NAME', 'main-cluster')
            
            # Check if we should use distributed sharding
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            logger.info(f"USE_DISTRIBUTED_SHARDING environment variable: {os.getenv('USE_DISTRIBUTED_SHARDING', 'not set')}")
            logger.info(f"Distributed sharding enabled: {use_distributed_sharding}")
            
            if use_distributed_sharding:
                logger.info(f"Using distributed sharding coordination for instance {instance_id} in cluster {cluster_name}")
                
                # Get or register our shard assignment from Supabase
                shard_assignment = await self._get_shard_assignment(instance_id, cluster_name)
                
                if shard_assignment:
                    # Use assigned shard
                    self._bot = discord.Client(
                        intents=intents,
                        shard_id=shard_assignment['shard_id'],
                        shard_count=shard_assignment['total_shards']
                    )
                    logger.info(f"Using distributed shard {shard_assignment['shard_id']} of {shard_assignment['total_shards']} (instance: {instance_id})")
                else:
                    # Fallback to auto-sharding if coordination fails
                    logger.warning("Distributed shard coordination failed, falling back to auto-sharding")
                    self._bot = discord.AutoShardedClient(intents=intents)
            else:
                # Traditional environment variable sharding or auto-sharding
                shard_id = int(os.getenv('SHARD_ID', '-1'))
                shard_count = int(os.getenv('SHARD_COUNT', '1'))
                
                if shard_id >= 0 and shard_count > 1:
                    # Manual sharding via environment variables
                    self._bot = discord.Client(
                        intents=intents,
                        shard_id=shard_id,
                        shard_count=shard_count
                    )
                    logger.info(f"Using env-based manual sharding: shard {shard_id}/{shard_count}")
                else:
                    # Auto-sharding for single instance
                    self._bot = discord.AutoShardedClient(intents=intents)
                    logger.info("Using auto-sharding for single instance")
            
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
            logger.error("Cannot setup event handlers - bot is None!")
            return
        
        logger.info("Setting up Discord bot event handlers...")
        
        @self._bot.event
        async def on_ready():
            logger.info(f"🟢🟢🟢 ON_READY EVENT TRIGGERED! Bot logged in as {self._bot.user} 🟢🟢🟢")
            logger.info(f"Bot is in {len(self._bot.guilds)} guilds")
            
            # Log shard information for both auto and manual sharding
            if hasattr(self._bot, 'shards') and self._bot.shards:
                # AutoShardedClient
                logger.info(f"Bot is using {len(self._bot.shards)} auto-managed shards")
                for shard_id, shard in self._bot.shards.items():
                    shard_guilds = [g for g in self._bot.guilds if g.shard_id == shard_id]
                    logger.info(f"  - Shard {shard_id}: {len(shard_guilds)} guilds, latency: {shard.latency:.2f}ms")
            elif hasattr(self._bot, 'shard_id') and self._bot.shard_id is not None:
                # Manual sharding
                shard_id = self._bot.shard_id
                shard_count = getattr(self._bot, 'shard_count', 1)
                logger.info(f"Bot is using manual sharding: shard {shard_id} of {shard_count} total")
                logger.info(f"  - Current shard {shard_id}: {len(self._bot.guilds)} guilds, latency: {self._bot.latency:.2f}ms")
            else:
                logger.info("Bot is using no sharding (single instance)")
            
            # Log guild information
            for guild in self._bot.guilds:
                shard_info = f", Shard: {guild.shard_id}" if hasattr(guild, 'shard_id') else ""
                logger.info(f"  - Guild: {guild.name} (ID: {guild.id}{shard_info})")
            
            # Clear the starting flag since we're now ready
            self._is_starting = False
            logger.info("Bot is now fully ready, cleared starting flag")
            
            # Send interactive status embed to the specified thread
            await self._send_status_message()
            
            # Update heartbeat for distributed sharding
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if use_distributed_sharding:
                instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
                cluster_name = os.getenv('CLUSTER_NAME', 'default')
                guild_count = len(self._bot.guilds)
                
                # Calculate average latency
                if hasattr(self._bot, 'shards') and self._bot.shards:
                    latency_ms = sum(shard.latency for shard in self._bot.shards.values()) / len(self._bot.shards) * 1000
                else:
                    latency_ms = self._bot.latency * 1000
                
                await tracker_manager.update_heartbeat(
                    instance_id=instance_id,
                    cluster_name=cluster_name,
                    guild_count=guild_count,
                    latency_ms=latency_ms
                )
                logger.info(f"Updated heartbeat for distributed sharding: {guild_count} guilds, {latency_ms:.2f}ms latency")
        
        @self._bot.event
        async def on_shard_ready(shard_id):
            logger.info(f"🟠 SHARD {shard_id} READY! This specific shard is now connected")
        
        @self._bot.event
        async def on_shard_connect(shard_id):
            logger.info(f"🔵 SHARD {shard_id} CONNECTED! Connection established to Discord gateway")
        
        @self._bot.event
        async def on_shard_disconnect(shard_id):
            logger.warning(f"🟡 SHARD {shard_id} DISCONNECTED! Connection to Discord gateway lost")
        
        @self._bot.event
        async def on_shard_resumed(shard_id):
            logger.info(f"🟢 SHARD {shard_id} RESUMED! Reconnected and resumed previous session")
        
        @self._bot.event
        async def on_connect():
            logger.info(f"🔵 BOT CONNECTED! Connected to Discord gateway")
        
        @self._bot.event
        async def on_disconnect():
            logger.warning(f"🟡 BOT DISCONNECTED! Connection to Discord gateway lost")
        
        @self._bot.event
        async def on_resumed():
            logger.info(f"🟢 BOT RESUMED! Reconnected and resumed previous session")
        
        logger.info("✅ Discord bot event handlers set up successfully")
    
    async def _get_shard_assignment(self, instance_id: str, cluster_name: str, total_shards: int = 2):
        """Get shard assignment from tracker"""
        try:
            return await tracker_manager.get_shard_assignment(
                instance_id=instance_id, 
                cluster_name=cluster_name,
                total_shards=total_shards
            )
        except Exception as e:
            logger.error(f"Failed to get shard assignment: {e}")
            return None
    
    async def _send_status_embed(self):
        """Send interactive status embed to Discord thread (matching old implementation)"""
        try:
            logger.info(f"Attempting to send status embed to thread {DISCORD_THREAD_ID}")
            
            # Try to get the thread/channel (cache first)
            thread = self._bot.get_channel(DISCORD_THREAD_ID)
            if not thread:
                logger.info(f"Thread not in cache, attempting to fetch from API...")
                try:
                    thread = await self._bot.fetch_channel(DISCORD_THREAD_ID)
                    logger.info(f"Successfully fetched thread from API: {thread.name}")
                except discord.NotFound:
                    logger.error(f"Thread with ID {DISCORD_THREAD_ID} not found via API")
                    return
                except discord.Forbidden:
                    logger.error(f"No permission to access thread {DISCORD_THREAD_ID}")
                    return
            else:
                logger.info(f"Found thread in cache: {thread.name} (Type: {type(thread).__name__})")
            
            # Clean up previous status message
            if self._last_status_message_id:
                try:
                    old_message = await thread.fetch_message(self._last_status_message_id)
                    await old_message.delete()
                    logger.info(f"Deleted previous status message {self._last_status_message_id}")
                except (discord.NotFound, discord.Forbidden):
                    logger.info("Previous status message not found or cannot delete")
                except Exception as e:
                    logger.warning(f"Error deleting previous status message: {e}")
            
            # Import and use the interactive status embed
            from .embed.discord_status_embed import send_bot_status_embed
            logger.info("Sending interactive status embed with buttons...")
            
            # Send the interactive status embed
            status_message = await send_bot_status_embed(thread, self)
            self._last_status_message_id = status_message.id
            
            logger.info(f"✅ Successfully sent interactive status embed to thread {DISCORD_THREAD_ID} (Message ID: {status_message.id})")
            
        except Exception as e:
            logger.error(f"❌ Failed to send status embed: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            
            # Fallback to simple message
            await self._send_simple_status_message("🟢 **Bot is now ONLINE** - Ready to receive notifications!")
    
    async def _send_simple_status_message(self, message: str):
        """Send simple status message as fallback"""
        try:
            logger.info(f"Sending simple status message to thread {DISCORD_THREAD_ID}")
            
            # Try to get the thread/channel (cache first)
            thread = self._bot.get_channel(DISCORD_THREAD_ID)
            if not thread:
                try:
                    thread = await self._bot.fetch_channel(DISCORD_THREAD_ID)
                except (discord.NotFound, discord.Forbidden):
                    logger.error(f"Cannot access thread {DISCORD_THREAD_ID} for simple message")
                    return
            
            # Send simple message
            status_message = await thread.send(message)
            self._last_status_message_id = status_message.id
            logger.info(f"✅ Sent simple status message to thread {DISCORD_THREAD_ID}")
            
        except Exception as e:
            logger.error(f"❌ Failed to send simple status message: {e}")
    
    async def _send_status_message(self):
        """Send status message to Discord thread (wrapper for backward compatibility)"""
        await self._send_status_embed()
    
    def get_bot(self) -> Optional[discord.Client]:
        """Get the current bot instance"""
        return self._bot
    
    def get_status(self) -> dict:
        """Get current bot status"""
        if not self._bot:
            return {
                "initialized": False,
                "is_ready": False,
                "is_starting": self._is_starting,
                "is_stopping": self._is_stopping,
                "is_closed": True,
                "guild_count": 0
            }
        
        return {
            "initialized": True,
            "is_ready": not self._bot.is_closed() and not self._is_starting,
            "is_starting": self._is_starting,
            "is_stopping": self._is_stopping,
            "is_closed": self._bot.is_closed(),
            "guild_count": len(self._bot.guilds) if self._bot.guilds else 0
        }
    
    def get_status_with_health(self) -> dict:
        """Get current bot status with health data"""
        try:
            # Get basic bot status
            bot_status = self.get_status()
            
            # Get health data
            from ...utils.health_monitor import health_monitor
            health_data = health_monitor.get_comprehensive_health()
            
            return {
                "bot_status": bot_status,
                "health_data": health_data
            }
        except Exception as e:
            logger.warning(f"Failed to get health data: {e}")
            # Return just bot status if health data fails
            return {
                "bot_status": self.get_status(),
                "health_data": {
                    "error": str(e),
                    "health_status": "UNKNOWN"
                }
            }
    
    async def start_bot(self):
        """Start the Discord bot"""
        if self._is_starting:
            raise Exception("Bot is already starting")
        if self._is_stopping:
            raise Exception("Bot is currently stopping, please wait")
        
        # Debug bot state
        if self._bot:
            logger.info(f"DEBUG: Bot exists: {self._bot}")
            logger.info(f"DEBUG: Bot is_closed: {self._bot.is_closed()}")
            logger.info(f"DEBUG: Bot has is_ready: {hasattr(self._bot, 'is_ready')}")
            if hasattr(self._bot, 'is_ready'):
                logger.info(f"DEBUG: Bot is_ready(): {self._bot.is_ready()}")
            logger.info(f"DEBUG: Bot has latency: {hasattr(self._bot, 'latency')}")
            if hasattr(self._bot, 'latency'):
                logger.info(f"DEBUG: Bot latency: {self._bot.latency}")
        
        # For now, just rely on the _is_starting flag to prevent double starts
        # The detailed checks were causing issues with fresh bot instances
        
        try:
            self._is_starting = True
            logger.info("Starting Discord bot...")
            
            # Initialize bot if not already done
            if not self._bot:
                await self.initialize_bot()
            
            # Start the bot - this will run until the bot is stopped
            logger.info("Bot about to start - this will run the event loop...")
            await self._bot.start(self._token)
            
        except Exception as e:
            self._is_starting = False
            logger.error(f"Failed to start bot: {e}")
            raise
        finally:
            # This will only execute when the bot stops
            self._is_starting = False
            logger.info("Bot startup completed or stopped")
    
    async def stop_bot(self, send_message: bool = True):
        """Stop the Discord bot"""
        if self._is_stopping:
            raise Exception("Bot is already stopping")
        if not self._bot or self._bot.is_closed():
            raise Exception("Bot is not running")
        
        try:
            self._is_stopping = True
            logger.info("Stopping Discord bot...")
            
            if send_message:
                await self._send_offline_message()
            
            # Close the bot
            await self._bot.close()
            
            # Clean up shard assignment if using distributed sharding
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if use_distributed_sharding:
                instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
                cluster_name = os.getenv('CLUSTER_NAME', 'default')
                await tracker_manager.cleanup_shard_assignment(instance_id, cluster_name)
            
            logger.info("Discord bot stopped successfully")
            
        except Exception as e:
            logger.error(f"Error stopping bot: {e}")
            raise
        finally:
            self._is_stopping = False
    
    async def restart_bot(self):
        """Restart the Discord bot"""
        if self._is_starting or self._is_stopping:
            raise Exception("Bot is currently starting or stopping")
        
        logger.info("Restarting Discord bot...")
        
        # Stop if running
        if self._bot and not self._bot.is_closed():
            await self.stop_bot(send_message=False)
        
        # Wait a moment
        await asyncio.sleep(2)
        
        # Reset bot instance
        self._bot = None
        
        # Start again
        await self.bring_online()
    
    async def bring_online(self):
        """Bring the Discord bot online"""
        if self._bot and not self._bot.is_closed():
            raise Exception("Bot is already online")
        
        # Reset the bot instance and start fresh
        self._bot = None
        
        # Start the bot in the background
        async def start_bot_task():
            try:
                await self.start_bot()
            except Exception as e:
                logger.error(f"Failed to start bot in background task: {e}")
                self._is_starting = False
        
        # Create and start the task
        asyncio.create_task(start_bot_task())
    
    async def _send_offline_message(self):
        """Send offline message to Discord thread"""
        try:
            if not self._bot or self._bot.is_closed():
                return
            
            channel = self._bot.get_channel(DISCORD_THREAD_ID)
            if not channel:
                logger.warning(f"Could not find channel/thread with ID {DISCORD_THREAD_ID}")
                return
            
            # Create offline embed
            embed = discord.Embed(
                title="🛑 Discord Bot Status",
                description="Bot is going offline...",
                color=0xff0000  # Red
            )
            
            # Add timestamp
            import datetime
            embed.timestamp = datetime.datetime.now()
            
            # Send the message
            await channel.send(embed=embed)
            logger.info(f"Sent offline message to thread {DISCORD_THREAD_ID}")
            
        except Exception as e:
            logger.error(f"Failed to send offline message: {e}")
    
    async def cleanup_thread_messages(self, limit: int = DEFAULT_CLEANUP_LIMIT) -> int:
        """Clean up old messages in the Discord thread"""
        try:
            if not self._bot or self._bot.is_closed():
                raise Exception("Bot is not ready")
            
            channel = self._bot.get_channel(DISCORD_THREAD_ID)
            if not channel:
                raise Exception(f"Could not find channel/thread with ID {DISCORD_THREAD_ID}")
            
            # Get messages to delete (excluding the most recent status message)
            messages_to_delete = []
            async for message in channel.history(limit=limit):
                # Keep the most recent status message from this bot
                if message.id == self._last_status_message_id:
                    continue
                if message.author == self._bot.user:
                    messages_to_delete.append(message)
            
            # Delete messages
            deleted_count = 0
            for message in messages_to_delete:
                try:
                    await message.delete()
                    deleted_count += 1
                    await asyncio.sleep(0.5)  # Rate limit protection
                except discord.NotFound:
                    pass  # Message was already deleted
                except Exception as e:
                    logger.warning(f"Failed to delete message {message.id}: {e}")
            
            logger.info(f"Cleaned up {deleted_count} old messages from thread")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Failed to cleanup thread messages: {e}")
            raise


