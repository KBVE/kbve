"""
Discord bot service for managing core bot operations
"""
import os
import asyncio
import uuid
from typing import Optional
import discord
from notification_bot.utils.logger import logger

# Import constants
try:
    from ..supabase.constants import DISCORD_THREAD_ID, DEFAULT_CLEANUP_LIMIT
except ImportError:
    # Fallback constants
    DISCORD_THREAD_ID = os.getenv("DISCORD_THREAD_ID")
    DEFAULT_CLEANUP_LIMIT = 50

# Import managers - use try/except for graceful fallback
try:
    from ..supabase import vault_manager, tracker_manager
except ImportError:
    vault_manager = None
    tracker_manager = None


class DiscordBotService:
    """Discord bot service managed by Dishka"""

    def __init__(self):
        self._bot: Optional[discord.Client] = None
        self._token: Optional[str] = None
        self._is_starting: bool = False
        self._is_stopping: bool = False
        self._last_status_message_id: Optional[int] = None
        self._master_status_message_id: Optional[int] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

    async def initialize_bot(self) -> discord.Client:
        """Initialize the Discord bot with token from vault"""
        if self._bot is not None:
            return self._bot

        try:
            # Check if we're in development mode and have env vars set
            python_env = os.getenv('PYTHON_ENV', '').lower()
            is_development = python_env == 'development'

            # Try to get token from environment variables first if in development
            env_token = None
            if is_development:
                env_token = (os.getenv('DISCORD_BOT') or
                             os.getenv('DISCORD_BOT_TOKEN') or
                             os.getenv('DISCORD_TOKEN'))

            if env_token:
                logger.info("Using Discord token from environment variables (development mode)")
                self._token = env_token
            else:
                # Fallback to Supabase vault for production or when env vars not set
                logger.info("Retrieving Discord token from Supabase vault")
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

            # Check sharding configuration - priority order matters
            use_auto_scaling = os.getenv('USE_AUTO_SCALING', 'false').lower() == 'true'
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'

            logger.info(f"USE_AUTO_SCALING environment variable: {os.getenv('USE_AUTO_SCALING', 'not set')}")
            dist_shard_env = os.getenv('USE_DISTRIBUTED_SHARDING', 'not set')
            logger.info(f"USE_DISTRIBUTED_SHARDING environment variable: {dist_shard_env}")
            logger.info(f"Auto-scaling enabled: {use_auto_scaling}")
            logger.info(f"Distributed sharding enabled: {use_distributed_sharding}")

            if use_auto_scaling:
                # Auto-scaling: All shards in one process using AutoShardedClient
                logger.info(f"Using AutoShardedClient with all shards in one process for instance {instance_id}")
                suggested_shard_count = int(os.getenv('TOTAL_SHARDS', '2'))
                self._bot = discord.AutoShardedClient(
                    intents=intents,
                    shard_count=suggested_shard_count  # Suggest minimum, Discord may use more
                )
                logger.info(f"Created AutoShardedClient with {suggested_shard_count} shards in one process")

            elif use_distributed_sharding:
                # True distributed sharding: One shard per container using manual Client
                shard_id = int(os.getenv('SHARD_ID', '0'))
                shard_count = int(os.getenv('SHARD_COUNT', '2'))

                logger.info(f"Using true distributed sharding for instance {instance_id}")
                logger.info(f"This container will run shard {shard_id} of {shard_count} total shards")

                self._bot = discord.Client(
                    intents=intents,
                    shard_id=shard_id,
                    shard_count=shard_count
                )
                logger.info(f"Created distributed Client for shard {shard_id}/{shard_count}")

            else:
                # Fallback: Traditional environment variable sharding or single instance auto-sharding
                shard_id = int(os.getenv('SHARD_ID', '-1'))
                shard_count = int(os.getenv('SHARD_COUNT', '1'))

                if shard_id >= 0 and shard_count > 1:
                    # Manual sharding via environment variables (backward compatibility)
                    self._bot = discord.Client(
                        intents=intents,
                        shard_id=shard_id,
                        shard_count=shard_count
                    )
                    logger.info(f"Using fallback manual sharding: shard {shard_id}/{shard_count}")
                else:
                    # Auto-sharding for single instance
                    self._bot = discord.AutoShardedClient(intents=intents)
                    logger.info("Using fallback auto-sharding for single instance")

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

            # Log shard information and track what Discord actually assigned
            actual_shards = []
            if hasattr(self._bot, 'shards') and self._bot.shards:
                # AutoShardedClient - track what Discord determined
                logger.info(f"🔍 Discord determined {len(self._bot.shards)} shards for this instance")
                for shard_id, shard in self._bot.shards.items():
                    shard_guilds = [g for g in self._bot.guilds if g.shard_id == shard_id]
                    actual_shards.append(shard_id)
                    logger.info(f"  ✅ Shard {shard_id}: {len(shard_guilds)} guilds, latency: {shard.latency:.2f}ms")

                # Check master server assignment
                from ..supabase.constants import MASTER_SERVER
                master_shard = MASTER_SERVER % len(self._bot.shards) if self._bot.shards else 0
                if master_shard in actual_shards:
                    logger.info(f"🎯 This instance OWNS master server {MASTER_SERVER} (shard {master_shard})")
                else:
                    logger.info(
                        f"ℹ️ Master server {MASTER_SERVER} belongs to shard"
                        f" {master_shard}, not in our shards: {actual_shards}"
                    )

            elif hasattr(self._bot, 'shard_id') and self._bot.shard_id is not None:
                # Manual sharding - track what was assigned
                shard_id = self._bot.shard_id
                shard_count = getattr(self._bot, 'shard_count', 1)
                actual_shards = [shard_id]
                logger.info(f"📌 Using manual shard assignment: {shard_id} of {shard_count} total")
                logger.info(
                    f"  - Current shard {shard_id}: {len(self._bot.guilds)}"
                    f" guilds, latency: {self._bot.latency:.2f}ms"
                )
            else:
                # No sharding
                actual_shards = [0]
                logger.info("📌 Using single instance (no sharding)")

            # Log all guild assignments
            logger.info(f"📋 Guild assignments for shards {actual_shards}:")
            for guild in self._bot.guilds:
                shard_info = f", Shard: {guild.shard_id}" if hasattr(guild, 'shard_id') else ""
                # Highlight master server
                if guild.id == MASTER_SERVER:
                    logger.info(f"  - {guild.name} (ID: {guild.id}{shard_info}) 🎯 MASTER SERVER")
                else:
                    logger.info(f"  - {guild.name} (ID: {guild.id}{shard_info})")

            # Track actual shard assignment in database
            await self._record_actual_shard_assignment(actual_shards)

            # Clear the starting flag since we're now ready
            self._is_starting = False
            logger.info("Bot is now fully ready, cleared starting flag")

            # Send interactive status embed to the specified thread
            await self._send_status_message()

            # Start periodic heartbeat task (database tracking only)
            await self._start_periodic_heartbeat()

            # Update heartbeat for sharding configurations that need tracking
            use_auto_scaling = os.getenv('USE_AUTO_SCALING', 'false').lower() == 'true'
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if use_auto_scaling or use_distributed_sharding:
                instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
                cluster_name = os.getenv('CLUSTER_NAME', 'default')
                guild_count = len(self._bot.guilds)

                # Calculate average latency
                if hasattr(self._bot, 'shards') and self._bot.shards:
                    shard_vals = self._bot.shards.values()
                    latency_ms = sum(s.latency for s in shard_vals) / len(self._bot.shards) * 1000
                else:
                    latency_ms = self._bot.latency * 1000

                await tracker_manager.update_heartbeat(
                    instance_id=instance_id,
                    cluster_name=cluster_name,
                    guild_count=guild_count,
                    latency_ms=latency_ms
                )
                sharding_type = "auto-scaling" if use_auto_scaling else "distributed"
                logger.info(
                    f"Updated heartbeat for {sharding_type} sharding:"
                    f" {guild_count} guilds, {latency_ms:.2f}ms latency"
                )

            # Verify master server connection and control
            await self._verify_master_server_control()

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
            logger.info("🔵 BOT CONNECTED! Connected to Discord gateway")

        @self._bot.event
        async def on_disconnect():
            logger.warning("🟡 BOT DISCONNECTED! Connection to Discord gateway lost")

        @self._bot.event
        async def on_resumed():
            logger.info("🟢 BOT RESUMED! Reconnected and resumed previous session")

        logger.info("✅ Discord bot event handlers set up successfully")

    async def _start_periodic_heartbeat(self):
        """Start periodic database heartbeat tracking (every 30 seconds)"""
        if self._heartbeat_task and not self._heartbeat_task.done():
            logger.warning("Heartbeat task already running")
            return

        async def heartbeat_loop():
            await asyncio.sleep(30)  # Wait 30 seconds before first heartbeat
            while not self._bot.is_closed():
                try:
                    await self._periodic_heartbeat()
                    await asyncio.sleep(30)  # 30 second intervals
                except Exception as e:
                    logger.error(f"Error in periodic heartbeat: {e}")
                    await asyncio.sleep(10)  # Shorter retry interval on error

        self._heartbeat_task = asyncio.create_task(heartbeat_loop())
        logger.info("Started periodic database heartbeat task")

    async def _periodic_heartbeat(self):
        """Perform periodic database heartbeat tracking only"""
        try:
            # Update database heartbeat only for configurations that need tracking
            use_auto_scaling = os.getenv('USE_AUTO_SCALING', 'false').lower() == 'true'
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if use_auto_scaling or use_distributed_sharding:
                instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
                cluster_name = os.getenv('CLUSTER_NAME', 'default')
                guild_count = len(self._bot.guilds) if self._bot.guilds else 0

                # Calculate average latency
                if hasattr(self._bot, 'shards') and self._bot.shards:
                    shard_vals = self._bot.shards.values()
                    latency_ms = sum(s.latency for s in shard_vals) / len(self._bot.shards) * 1000
                else:
                    latency_ms = (
                        self._bot.latency * 1000 if hasattr(self._bot, 'latency') else 0
                    )

                # Update database heartbeat only
                from ..supabase import tracker_manager
                await tracker_manager.update_heartbeat(
                    instance_id=instance_id,
                    cluster_name=cluster_name,
                    guild_count=guild_count,
                    latency_ms=latency_ms
                )
                sharding_type = "auto-scaling" if use_auto_scaling else "distributed"
                logger.debug(
                    f"Updated database heartbeat ({sharding_type}):"
                    f" {guild_count} guilds, {latency_ms:.2f}ms latency"
                )

        except Exception as e:
            logger.error(f"Error in periodic heartbeat: {e}")

    async def _update_master_server_embed(self):
        """Update the status embed in the master server"""
        try:
            from ..supabase.constants import MASTER_SERVER

            master_guild_id = MASTER_SERVER
            master_guild = self._bot.get_guild(master_guild_id)

            if not master_guild:
                logger.debug(f"Master guild {master_guild_id} not found in cache, fetching...")
                try:
                    master_guild = await self._bot.fetch_guild(master_guild_id)
                except discord.NotFound:
                    logger.warning(f"Master server {master_guild_id} not found")
                    return
                except discord.Forbidden:
                    logger.warning(f"No access to master server {master_guild_id}")
                    return

            # Find the status channel (could be default channel or specific channel)
            status_channel = None
            for channel in master_guild.text_channels:
                if channel.name in ['general', 'bot-status', 'status'] or channel == master_guild.system_channel:
                    status_channel = channel
                    break

            if not status_channel:
                status_channel = master_guild.text_channels[0] if master_guild.text_channels else None

            if not status_channel:
                logger.warning(f"No suitable text channel found in master server {master_guild_id}")
                return

            # Update the embed with shard-specific title
            await self._send_master_status_embed(status_channel)

        except Exception as e:
            logger.error(f"Error updating master server embed: {e}")

    async def _send_master_status_embed(self, channel):
        """Send or update status embed in master server with shard-specific title"""
        try:
            # Get current shard information
            current_shard = None
            if hasattr(self._bot, 'shard_id') and self._bot.shard_id is not None:
                current_shard = self._bot.shard_id

            # Import and create master server status embed with shard ID in title
            from .embed.discord_status_embed import BotStatusView
            view = await BotStatusView.create_master_server_view(self, current_shard)

            # Try to update existing message first
            if self._master_status_message_id:
                try:
                    existing_message = await channel.fetch_message(self._master_status_message_id)
                    await existing_message.edit(view=view)
                    logger.debug(
                        "✅ EDITED existing master server embed"
                        f" (shard {current_shard}, msg {self._master_status_message_id})"
                    )
                    return existing_message
                except discord.NotFound:
                    # Message was deleted, create new one
                    logger.info(
                        "⚠️ Previous master server embed"
                        f" {self._master_status_message_id} not found, creating new one"
                    )
                    self._master_status_message_id = None
                except Exception as e:
                    logger.warning(f"Failed to update existing master embed {self._master_status_message_id}: {e}")
                    self._master_status_message_id = None

            # Create new message only if we don't have an existing one
            new_message = await channel.send(view=view)
            self._master_status_message_id = new_message.id
            logger.info(f"🆕 CREATED new master server embed for shard {current_shard} (Message ID: {new_message.id})")
            return new_message

        except Exception as e:
            logger.error(f"Failed to send master status embed: {e}")

    async def _verify_master_server_control(self):
        """Verify which instance has control of master server for status embeds"""
        try:
            from ..supabase.constants import MASTER_SERVER

            master_guild_id = MASTER_SERVER
            master_guild = self._bot.get_guild(master_guild_id)

            if master_guild:
                logger.info("🎯 THIS INSTANCE HAS MASTER SERVER CONTROL")
                logger.info(f"  └─ Connected to: {master_guild.name} (ID: {master_guild_id})")
                logger.info(f"  └─ Will send status embeds to thread {DISCORD_THREAD_ID}")

                # Log which shard is handling this master server
                if hasattr(self._bot, 'shards') and self._bot.shards:
                    for shard_id in self._bot.shards:
                        if master_guild.shard_id == shard_id:
                            logger.info(f"  └─ Master server on our shard {shard_id}")
                            break
            else:
                logger.info("ℹ️ THIS INSTANCE DOES NOT HAVE MASTER SERVER CONTROL")
                logger.info(f"  └─ Not connected to master server {master_guild_id}")
                logger.info("  └─ Will NOT send status embeds (avoiding duplicates)")
                logger.info("  └─ This is expected for shards that don't own the master server")

        except Exception as e:
            logger.error(f"Error verifying master server control: {e}")

    async def _send_initial_master_server_embed(self):
        """Send initial status embed to master server on startup"""
        try:
            from ..supabase.constants import MASTER_SERVER

            master_guild_id = MASTER_SERVER
            master_guild = self._bot.get_guild(master_guild_id)

            # Only send if this shard owns the master server
            if not master_guild:
                logger.debug(f"Master server {master_guild_id} not accessible to this shard")
                return

            # Check if we own this guild
            if hasattr(self._bot, 'shard_id') and self._bot.shard_id is not None:
                expected_shard = master_guild_id % int(os.getenv('TOTAL_SHARDS', '2'))
                current_shard = self._bot.shard_id
                if expected_shard != current_shard:
                    logger.info(
                        f"Skipping master server embed - guild {master_guild_id}"
                        f" belongs to shard {expected_shard},"
                        f" we are shard {current_shard}"
                    )
                    return

            # Find status channel
            status_channel = None
            for channel in master_guild.text_channels:
                if channel.name in ['general', 'bot-status', 'status'] or channel == master_guild.system_channel:
                    status_channel = channel
                    break

            if not status_channel:
                status_channel = master_guild.text_channels[0] if master_guild.text_channels else None

            if status_channel:
                await self._send_master_status_embed(status_channel)
                logger.info(f"Sent initial master server embed to {master_guild.name} - {status_channel.name}")

        except Exception as e:
            logger.error(f"Error sending initial master server embed: {e}")

    async def _record_actual_shard_assignment(self, actual_shards: list):
        """Record what Discord.py actually assigned to this instance"""
        try:
            use_auto_scaling = os.getenv('USE_AUTO_SCALING', 'false').lower() == 'true'
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if not (use_auto_scaling or use_distributed_sharding):
                return

            from ..supabase import tracker_manager
            instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
            cluster_name = os.getenv('CLUSTER_NAME', 'default')

            # Record each shard this instance is handling
            for shard_id in actual_shards:
                logger.info(f"📝 Recording shard {shard_id} assignment for instance {instance_id}")

                # Use existing tracker but with discovered shard info
                guild_count = len([g for g in self._bot.guilds if g.shard_id == shard_id]) if self._bot.guilds else 0

                if hasattr(self._bot, 'shards') and shard_id in self._bot.shards:
                    latency_ms = self._bot.shards[shard_id].latency * 1000
                else:
                    latency_ms = self._bot.latency * 1000 if hasattr(self._bot, 'latency') else 0

                await tracker_manager.record_discovered_shard(
                    instance_id=instance_id,
                    cluster_name=cluster_name,
                    shard_id=shard_id,
                    total_shards=len(self._bot.shards) if hasattr(self._bot, 'shards') else 1,
                    guild_count=guild_count,
                    latency_ms=latency_ms
                )

        except Exception as e:
            logger.error(f"Error recording shard assignments: {e}")

    async def _update_master_server_shutdown_status(self):
        """Update master server embed to show shutdown status"""
        try:
            from ..supabase.constants import MASTER_SERVER

            master_guild_id = MASTER_SERVER
            master_guild = self._bot.get_guild(master_guild_id)

            if not master_guild:
                logger.debug("Master server not accessible for shutdown status update")
                return

            # Check if this instance owns the master server
            if hasattr(self._bot, 'shards') and self._bot.shards:
                master_shard = master_guild_id % len(self._bot.shards)
                our_shards = list(self._bot.shards.keys())
                if master_shard not in our_shards:
                    logger.debug(
                        "Skipping shutdown status - master server belongs to"
                        f" shard {master_shard}, we have {our_shards}"
                    )
                    return

            # Find status channel
            status_channel = None
            for channel in master_guild.text_channels:
                if channel.name in ['general', 'bot-status', 'status'] or channel == master_guild.system_channel:
                    status_channel = channel
                    break

            if not status_channel:
                status_channel = master_guild.text_channels[0] if master_guild.text_channels else None

            if status_channel and self._master_status_message_id:
                try:
                    # Update existing embed with shutdown status
                    from .embed.discord_status_embed import BotStatusView

                    # Get current shard for title
                    current_shard = None
                    if hasattr(self._bot, 'shards') and self._bot.shards:
                        current_shard = list(self._bot.shards.keys())[0] if self._bot.shards else None
                    elif hasattr(self._bot, 'shard_id'):
                        current_shard = self._bot.shard_id

                    view = await BotStatusView.create_shutdown_view(self, current_shard)

                    existing_message = await status_channel.fetch_message(self._master_status_message_id)
                    await existing_message.edit(view=view)
                    logger.info(f"🛑 Updated master server embed with shutdown status (shard {current_shard})")

                except discord.NotFound:
                    logger.debug("Master server embed not found for shutdown update")
                except Exception as e:
                    logger.warning(f"Failed to update master server shutdown status: {e}")

        except Exception as e:
            logger.error(f"Error updating master server shutdown status: {e}")

    async def _update_shutdown_status(self):
        """Update database status to stopping for tracking"""
        try:
            # Update database status to stopping for configurations that need tracking
            use_auto_scaling = os.getenv('USE_AUTO_SCALING', 'false').lower() == 'true'
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if use_auto_scaling or use_distributed_sharding:
                from ..supabase import tracker_manager
                instance_id = os.getenv('HOSTNAME', str(uuid.uuid4())[:8])
                cluster_name = os.getenv('CLUSTER_NAME', 'default')

                await tracker_manager.update_status_to_stopping(instance_id, cluster_name)
                logger.info(f"📝 Updated database status to 'stopping' for {instance_id}")

        except Exception as e:
            logger.error(f"Error updating shutdown status: {e}")

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
                logger.info("Thread not in cache, attempting to fetch from API...")
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

            logger.info(
                "✅ Successfully sent interactive status embed to thread"
                f" {DISCORD_THREAD_ID} (Message ID: {status_message.id})"
            )

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
        # Check if we should send status embeds based on master server access
        from ..supabase.constants import MASTER_SERVER

        # Check if this bot instance can see the master server
        master_guild = self._bot.get_guild(MASTER_SERVER)

        if not master_guild:
            logger.info(f"⚠️ Bot is NOT in master server {MASTER_SERVER} - skipping status embed to avoid duplicates")
            logger.info("This shard will handle its assigned guilds but won't post status embeds")
            return

        logger.info(f"✅ Bot IS in master server {MASTER_SERVER} - sending status embed")
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
                "guild_count": 0,
                "shard_count": 0,
                "current_shard": None,
                "shard_info": {}
            }

        # Collect shard information
        shard_info = {}
        current_shard = None
        shard_count = 0

        if hasattr(self._bot, 'shards') and self._bot.shards:
            # AutoShardedClient
            shard_count = len(self._bot.shards)
            for shard_id, shard in self._bot.shards.items():
                shard_guilds = [g for g in self._bot.guilds if g.shard_id == shard_id] if self._bot.guilds else []
                shard_info[str(shard_id)] = {
                    'shard_id': shard_id,
                    'guild_count': len(shard_guilds),
                    'latency': shard.latency * 1000,  # Convert to ms
                    'is_closed': shard.is_closed()
                }
        elif hasattr(self._bot, 'shard_id') and self._bot.shard_id is not None:
            # Manual sharding (single shard)
            current_shard = self._bot.shard_id
            shard_count = getattr(self._bot, 'shard_count', 1)
            shard_info[str(current_shard)] = {
                'shard_id': current_shard,
                'guild_count': len(self._bot.guilds) if self._bot.guilds else 0,
                'latency': self._bot.latency * 1000 if hasattr(self._bot, 'latency') else 0,
                'is_closed': self._bot.is_closed()
            }
        else:
            # No sharding (single instance)
            shard_count = 1
            current_shard = 0
            shard_info['0'] = {
                'shard_id': 0,
                'guild_count': len(self._bot.guilds) if self._bot.guilds else 0,
                'latency': self._bot.latency * 1000 if hasattr(self._bot, 'latency') else 0,
                'is_closed': self._bot.is_closed()
            }

        return {
            "initialized": True,
            "is_ready": not self._bot.is_closed() and not self._is_starting,
            "is_starting": self._is_starting,
            "is_stopping": self._is_stopping,
            "is_closed": self._bot.is_closed(),
            "guild_count": len(self._bot.guilds) if self._bot.guilds else 0,
            "shard_count": shard_count,
            "current_shard": current_shard,
            "shard_info": shard_info
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

            # Update database status to stopping and update master server embed
            await self._update_shutdown_status()

            # Stop heartbeat task
            if self._heartbeat_task and not self._heartbeat_task.done():
                self._heartbeat_task.cancel()
                logger.info("Cancelled periodic heartbeat task")

            # Close the bot
            await self._bot.close()

            # Clean up shard assignment if using sharding configurations that need tracking
            use_auto_scaling = os.getenv('USE_AUTO_SCALING', 'false').lower() == 'true'
            use_distributed_sharding = os.getenv('USE_DISTRIBUTED_SHARDING', 'false').lower() == 'true'
            if use_auto_scaling or use_distributed_sharding:
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

            # Check if we're in master server before sending offline message
            from ..supabase.constants import MASTER_SERVER
            master_guild = self._bot.get_guild(MASTER_SERVER)

            if not master_guild:
                logger.debug("Not in master server - skipping offline message")
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
