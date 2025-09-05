import discord
import logging
import asyncio
from typing import Optional
from .supabase import vault_manager, tracker_manager
from ..models.constants import DISCORD_THREAD_ID, DEFAULT_CLEANUP_LIMIT

logger = logging.getLogger("uvicorn")


class DiscordBotSingleton:
    """Singleton Discord bot instance"""
    
    _instance = None
    _bot: Optional[discord.Client] = None
    _token: Optional[str] = None
    _is_starting: bool = False
    _is_stopping: bool = False
    _last_status_message_id: Optional[int] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DiscordBotSingleton, cls).__new__(cls)
            cls._instance._is_starting = False
            cls._instance._is_stopping = False
            cls._instance._last_status_message_id = None
        return cls._instance
    
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
            import os
            import uuid
            
            # Get instance ID for this deployment
            instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
            cluster_name = os.getenv('CLUSTER_NAME', 'default')
            
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
            return
        
        @self._bot.event
        async def on_ready():
            logger.info(f"🟢 ON_READY EVENT TRIGGERED! Bot logged in as {self._bot.user}")
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
            # Clear flags on disconnect
            self._is_starting = False
            self._is_stopping = False
        
        @self._bot.event
        async def on_resumed():
            logger.info("🔄 Bot resumed connection")
        
        @self._bot.event
        async def on_error(event, *args, **kwargs):
            logger.error(f"Discord bot error in event {event}: {args}, {kwargs}")
    
    async def _send_status_embed(self):
        """Send an interactive status embed to the specified thread"""
        try:
            thread_id = DISCORD_THREAD_ID
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
                
                # Clean up old status message first
                await self._cleanup_old_status_message()
                
                # Import here to avoid circular imports
                from ..models.embed import send_bot_status_embed
                logger.info("Calling send_bot_status_embed...")
                message = await send_bot_status_embed(thread, self)
                
                if message:
                    # Track the new status message for future cleanup
                    self._last_status_message_id = message.id
                    logger.info(f"Status embed sent to thread {thread_id}, message ID: {message.id}")
                else:
                    logger.warning("Status embed message was None")
                
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
            thread_id = DISCORD_THREAD_ID
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
    
    async def _cleanup_old_status_message(self):
        """Delete the previous status message to keep thread clean"""
        if not self._last_status_message_id or not self._bot or not self._bot.is_ready():
            return
            
        try:
            thread_id = DISCORD_THREAD_ID
            thread = self._bot.get_channel(thread_id)
            
            if not thread:
                thread = await self._bot.fetch_channel(thread_id)
            
            if thread:
                try:
                    old_message = await thread.fetch_message(self._last_status_message_id)
                    await old_message.delete()
                    logger.info(f"Deleted old status message: {self._last_status_message_id}")
                except discord.NotFound:
                    logger.debug("Old status message already deleted or not found")
                except discord.Forbidden:
                    logger.warning("No permission to delete old status message")
                    
        except Exception as e:
            logger.debug(f"Could not cleanup old status message: {e}")
            
        # Clear the reference regardless of success
        self._last_status_message_id = None
    
    async def _get_shard_assignment(self, instance_id: str, cluster_name: str) -> dict:
        """Get shard assignment from distributed coordination system using tracker schema"""
        import os
        total_shards = int(os.getenv('TOTAL_SHARDS', '2'))
        return await tracker_manager.get_shard_assignment(instance_id, cluster_name, total_shards)
    
    async def _update_shard_heartbeat(self, instance_id: str, cluster_name: str):
        """Update heartbeat for this shard assignment with performance metrics"""
        # Gather performance metrics if bot is ready
        guild_count = len(self._bot.guilds) if self._bot and self._bot.is_ready() else 0
        latency_ms = round(self._bot.latency * 1000, 2) if self._bot and self._bot.is_ready() else 0
        
        await tracker_manager.update_heartbeat(
            instance_id=instance_id,
            cluster_name=cluster_name,
            guild_count=guild_count,
            latency_ms=latency_ms
        )
    
    async def _cleanup_shard_assignment(self):
        """Mark this instance's shard assignment as inactive"""
        import os
        
        instance_id = os.getenv('HOSTNAME', str(__import__('uuid').uuid4())[:8])
        cluster_name = os.getenv('CLUSTER_NAME', 'default')
        
        await tracker_manager.cleanup_shard_assignment(
            instance_id=instance_id,
            cluster_name=cluster_name
        )
    
    async def send_offline_message(self):
        """Send offline message before shutting down"""
        if self._bot and self._bot.is_ready():
            await self._send_simple_status_message("🔴 **Bot is going OFFLINE** - Shutting down gracefully...")
    
    async def start_bot(self):
        """Start the Discord bot with safeguards"""
        if self._is_starting:
            logger.warning("Bot is already starting, please wait...")
            return
        
        # Start health monitoring background task
        try:
            from ..utils.health_monitor import health_monitor
            await health_monitor.start_background_monitoring()
            logger.info("Started background health monitoring")
        except Exception as e:
            logger.warning(f"Failed to start health monitoring: {e}")
        
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
            # Always reinitialize if bot is None or closed
            if not self._bot or self._bot.is_closed():
                logger.info("Bot not initialized or closed, creating fresh instance...")
                await self.initialize_bot()
            
            if not self._token:
                raise Exception("Discord token not available")
            
            logger.info(f"Starting Discord bot with token: {self._token[:10]}...")
            logger.info(f"Bot intents: {self._bot.intents}")
            logger.info(f"Bot user before start: {self._bot.user}")
            
            # Start the bot in a background task - this runs forever, so don't block
            logger.info("Starting bot connection in background...")
            import asyncio
            asyncio.create_task(self._bot.start(self._token))
            
            # Wait a short moment to ensure connection starts
            await asyncio.sleep(2)
            logger.info("Bot start initiated (running in background)")
            
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
        
        # Stop health monitoring background task
        try:
            from ..utils.health_monitor import health_monitor
            await health_monitor.stop_background_monitoring()
            logger.info("Stopped background health monitoring")
        except Exception as e:
            logger.warning(f"Failed to stop health monitoring: {e}")
        try:
            # Send offline message before closing (unless already sent)
            if send_message:
                await self.send_offline_message()
                # Give a moment for the message to send
                await asyncio.sleep(1)
            
            # Mark shard assignment as inactive
            await self._cleanup_shard_assignment()
            
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
        status = {
            "initialized": self._bot is not None,
            "is_ready": self.is_ready(),
            "is_closed": self._bot.is_closed() if self._bot else True,
            "is_starting": self._is_starting,
            "is_stopping": self._is_stopping,
            "guild_count": len(self._bot.guilds) if self._bot and self._bot.is_ready() else 0
        }
        
        # Add shard information for both AutoShardedClient and manual sharding
        if self._bot and self._bot.is_ready():
            if hasattr(self._bot, 'shards') and self._bot.shards:
                # AutoShardedClient
                status.update({
                    "shard_count": len(self._bot.shards),
                    "shard_info": {
                        str(shard_id): {  # Convert shard_id to string for Pydantic compatibility
                            "latency": round(shard.latency * 1000, 2),  # Convert to ms
                            "is_closed": shard.is_closed(),
                            "guild_count": len([g for g in self._bot.guilds if g.shard_id == shard_id])
                        }
                        for shard_id, shard in self._bot.shards.items()
                    }
                })
            elif hasattr(self._bot, 'shard_id') and self._bot.shard_id is not None:
                # Manual sharding (single shard per instance)
                shard_id = self._bot.shard_id
                shard_count = getattr(self._bot, 'shard_count', 1)
                status.update({
                    "shard_count": shard_count,
                    "current_shard": shard_id,
                    "shard_info": {
                        str(shard_id): {
                            "latency": round(self._bot.latency * 1000, 2),
                            "is_closed": self._bot.is_closed(),
                            "guild_count": len(self._bot.guilds)
                        }
                    }
                })
            else:
                # No sharding info available
                status.update({
                    "shard_count": 1,
                    "shard_info": {
                        "0": {
                            "latency": round(self._bot.latency * 1000, 2),
                            "is_closed": self._bot.is_closed(),
                            "guild_count": len(self._bot.guilds)
                        }
                    }
                })
        else:
            status.update({
                "shard_count": 0,
                "shard_info": {}
            })
            
        return status
    
    def get_status_with_health(self) -> dict:
        """Get detailed bot status with health metrics"""
        from ..utils.health_monitor import health_monitor
        
        # Get basic bot status
        status = self.get_status()
        
        # Get health data
        health_data = health_monitor.get_comprehensive_health()
        
        # Create enhanced status model
        from ..models.status import BotStatusModel
        status_model = BotStatusModel.from_status_dict(status, health_data)
        
        return {
            "bot_status": status,
            "health_data": health_data,
            "status_model": status_model.model_dump()
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
        
        # Clear the bot instance to force fresh creation
        self._bot = None
        
        # Start the bot again (this will create new instance and send status embed)
        await self.start_bot()
        
        logger.info("Discord bot restarted successfully")
    
    async def bring_online(self):
        """Bring the bot online if it's offline"""
        if self._is_starting:
            raise Exception("Bot is already starting")
        
        if self._bot and not self._bot.is_closed():
            raise Exception("Bot is already online")
        
        logger.info("Bringing Discord bot online...")
        
        # If bot exists but is closed, clear it and create fresh instance
        if self._bot and self._bot.is_closed():
            logger.info("Bot instance is closed, creating fresh instance...")
            self._bot = None
        
        await self.start_bot()  # This will send the status embed via on_ready
    
    async def cleanup_thread_messages(self, limit: int = DEFAULT_CLEANUP_LIMIT):
        """Clean up old bot messages in the status thread"""
        if not self._bot or not self._bot.is_ready():
            return 0
            
        try:
            thread_id = DISCORD_THREAD_ID
            thread = self._bot.get_channel(thread_id)
            
            if not thread:
                thread = await self._bot.fetch_channel(thread_id)
            
            if not thread:
                return 0
            
            logger.info(f"Starting cleanup, protecting message ID: {self._last_status_message_id}")
            
            deleted_count = 0
            async for message in thread.history(limit=limit):
                # Only delete messages from this bot, but NOT the current status message
                if message.author == self._bot.user:
                    if message.id == self._last_status_message_id:
                        logger.debug(f"Skipping current status message: {message.id}")
                        continue
                    
                    try:
                        logger.debug(f"Deleting old message: {message.id}")
                        await message.delete()
                        deleted_count += 1
                        # Small delay to avoid rate limits
                        await asyncio.sleep(0.5)
                    except (discord.NotFound, discord.Forbidden):
                        continue
                        
            logger.info(f"Cleaned up {deleted_count} old bot messages from thread (protected: {self._last_status_message_id})")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error cleaning up thread messages: {e}")
            return 0


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