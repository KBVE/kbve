from __future__ import annotations

import discord
from discord import ui
from typing import TYPE_CHECKING, Optional
import datetime
import asyncio
from ...supabase.constants import ADMIN_ROLE_ID
from ....models.status import BotStatusModel, StatusState

if TYPE_CHECKING:
    from .. import DiscordBotService


class BotStatusView(ui.View):
    """Discord bot status display as a View with embedded buttons"""

    def __init__(self, bot_instance: 'DiscordBotService', *, wolf_image_url: str = None) -> None:
        super().__init__(timeout=None)  # No timeout for persistent view
        self.__bot_instance = bot_instance  # Store bot instance for status checks

        # Get current bot status model
        status_model = self._get_bot_status_model()

        # Use state-based image instead of wolf image
        state_image_url = status_model.get_image_url()

        # Initialize status text
        self.status_text = self._get_status_text()

        # Store thumbnail URL for embed
        self.thumbnail_url = state_image_url

        # Store color for embed
        if hasattr(self, '_is_shutdown_view') and self._is_shutdown_view:
            self.embed_color = StatusState.STOPPING.color
        else:
            self.embed_color = status_model.get_health_based_color()

    def _get_bot_status_model(self) -> BotStatusModel:
        """Get current bot status as Pydantic model with health data"""
        try:
            status_with_health = self.__bot_instance.get_status_with_health()
            status_dict = status_with_health["bot_status"]
            health_data = status_with_health["health_data"]
            return BotStatusModel.from_status_dict(status_dict, health_data)
        except Exception as e:
            # Fallback to basic status without health data if health collection fails
            import logging
            logging.warning(f"Health data collection failed, using basic status: {e}")
            status_dict = self.__bot_instance.get_status()
            return BotStatusModel.from_status_dict(status_dict)

    def _format_shard_info(self, status_model: BotStatusModel) -> list:
        """Format shard information for display"""
        shard_lines = []
        for shard_id, shard_data in status_model.shard_info.items():
            latency = shard_data.get('latency', 0)
            guild_count = shard_data.get('guild_count', 0)
            is_closed = shard_data.get('is_closed', False)

            # Choose status emoji based on latency and connection
            if is_closed:
                status_emoji = "🔴"
            elif latency < 100:
                status_emoji = "🟢"
            elif latency < 200:
                status_emoji = "🟡"
            else:
                status_emoji = "🟠"

            shard_lines.append(
                f"• Shard {shard_id}: {status_emoji} {latency:.0f}ms | {guild_count} guilds"
            )

        return shard_lines

    def _get_status_text(self) -> str:
        """Generate status text based on bot state with health metrics"""
        # Check if this is a shutdown view
        if hasattr(self, '_is_shutdown_view') and self._is_shutdown_view:
            return self._get_shutdown_status_text()

        status_model = self._get_bot_status_model()

        # Get health status indicator
        if status_model.health_status == "HEALTHY":
            health_emoji = "🟢"
        elif status_model.health_status == "WARNING":
            health_emoji = "🟡"
        else:
            health_emoji = "🔴"

        # Get cache age info (if available)
        try:
            status_with_health = self.__bot_instance.get_status_with_health()
            health_data = status_with_health["health_data"]
            cache_age = health_data.get("cache_age_seconds", 0)
            cache_info = f" (cached {cache_age}s ago)" if cache_age > 0 else " (fresh)"
        except Exception:
            cache_info = ""

        # Build lines list with conditional shard info
        shard_display = "N/A"
        if status_model.shard_count > 0:
            if status_model.current_shard is not None:
                # Manual sharding - show current shard ID and total
                shard_display = (
                    f"{status_model.current_shard}/{status_model.shard_count}"
                    f" (Shard ID: {status_model.current_shard})"
                )
            else:
                # Auto-sharding - show total count
                shard_display = f"{status_model.shard_count} (Auto-managed)"

        # Check if this is for master server display
        title = "🤖 **Discord Bot Status Dashboard**"
        if hasattr(self, '_master_server_shard_id') and self._master_server_shard_id is not None:
            title = f"🤖 **Bot Status - Shard {self._master_server_shard_id}**"

        lines = [
            title,
            "",
            f"**Status:** {status_model.get_emoji()} {status_model.get_status_description()}",
            f"**Health:** {health_emoji} {status_model.health_status}",
            f"**Initialized:** {'Yes' if status_model.initialized else 'No'}",
            f"**Ready:** {'Yes' if status_model.is_ready else 'No'}",
            f"**Guilds:** {status_model.guild_count}",
            f"**Shards:** {shard_display}",
            ""
        ]

        # Add shard details if available
        if status_model.shard_count > 0:
            lines.append("**🌐 Shard Details:**")
            lines.extend(self._format_shard_info(status_model))
            lines.append("")

        # Continue with rest of status
        lines.extend([
            f"**💾 System Resources{cache_info}:**",
            f"• Memory: {status_model.memory_usage_mb:.1f}MB ({status_model.memory_percent:.1f}%)",
            f"• CPU: {status_model.cpu_percent:.1f}%",
            f"• Threads: {status_model.thread_count}",
            f"• Uptime: {status_model.uptime_formatted}",
            "",
            "**State Flags:**",
            f"• Starting: {'Yes' if status_model.is_starting else 'No'}",
            f"• Stopping: {'Yes' if status_model.is_stopping else 'No'}",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ])

        return "\n".join(lines)

    def _get_shutdown_status_text(self) -> str:
        """Generate shutdown status text using STOPPING state"""
        # Get shard ID for title
        shard_id = getattr(self, '_master_server_shard_id', None)
        if shard_id is not None:
            title = f"🤖 **Bot Status - Shard {shard_id}**"
        else:
            title = "🤖 **Discord Bot Status Dashboard**"

        # Use the STOPPING state from our enum
        stopping_state = StatusState.STOPPING

        lines = [
            title,
            "",
            f"**Status:** {stopping_state.emoji} {stopping_state.display_name}",
            "**Operation:** Graceful shutdown in progress",
            "",
            "⏹️ **Shutdown Process:**",
            "• Stopping heartbeat monitoring",
            "• Closing Discord connections",
            "• Cleaning up resources",
            "• Updating database status",
            "",
            "Bot will be offline momentarily.",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ]

        return "\n".join(lines)

    def _get_pending_online_text(self) -> str:
        """Generate pending online text"""
        lines = [
            "🤖 **Discord Bot Status Dashboard**",
            "",
            "**Status:** 🟡 Coming Online...",
            "**Operation:** Starting bot connection",
            "",
            "⏳ Please wait while the bot comes online...",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ]
        return "\n".join(lines)

    def _get_pending_offline_text(self) -> str:
        """Generate pending offline text"""
        lines = [
            "🤖 **Discord Bot Status Dashboard**",
            "",
            "**Status:** 🟠 Going Offline...",
            "**Operation:** Shutting down gracefully",
            "",
            "⏳ Please wait while the bot stops safely...",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ]
        return "\n".join(lines)

    def _get_pending_restart_text(self) -> str:
        """Generate pending restart text"""
        lines = [
            "🤖 **Discord Bot Status Dashboard**",
            "",
            "**Status:** 🟡 Restarting...",
            "**Operation:** Performing full restart",
            "",
            "⏳ Please wait while the bot restarts...",
            "• Stopping current instance",
            "• Reinitializing connection",
            "• Starting fresh instance",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ]
        return "\n".join(lines)

    async def _show_pending_restart(self):
        """Show pending restart state with appropriate color and image"""
        # Update status text
        self.status_text = self._get_pending_restart_text()

        # Use pending/starting state for color and image
        pending_color = StatusState.STARTING.color
        pending_image = StatusState.STARTING.image_url

        # Update thumbnail with pending image
        self.thumbnail_url = pending_image
        self.embed_color = pending_color

    def _get_status_color(self) -> discord.Color:
        """Get container color based on bot status and health"""
        status_model = self._get_bot_status_model()
        return status_model.get_health_based_color()

    @ui.button(label='🔄 Refresh', style=discord.ButtonStyle.primary)
    async def refresh_status_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        import logging
        logger = logging.getLogger("app")

        # Get Discord ID and lookup user profile
        discord_id = str(interaction.user.id)
        logger.info(f"🔄 Refresh button clicked by {interaction.user} (Discord ID: {discord_id})")

        # Try to lookup user in Supabase
        try:
            from ....api.supabase import user_manager
            user_profile = await user_manager.find_user_by_discord_id(discord_id)
            if user_profile:
                logger.info(f"   └─ Supabase user found: {user_profile.user_id} ({user_profile.email})")
            else:
                logger.info(f"   └─ No Supabase user profile found for Discord ID: {discord_id}")
        except Exception as e:
            logger.warning(f"   └─ Failed to lookup Supabase user: {e}")

        try:
            await interaction.response.defer()
            logger.info("Refresh button interaction deferred")

            # Force refresh health data
            try:
                from ....utils.health_monitor import health_monitor
                await health_monitor.force_refresh()
                logger.info("Health data refreshed successfully")
            except Exception as e:
                logger.warning(f"Failed to force refresh health data: {e}")

            # Refresh the status display
            logger.info("Refreshing status display...")
            await self.refresh_status()
            logger.info("Status display refreshed")

            # Create new embed with updated status
            embed = self.create_status_embed()

            # Update the message with new embed
            logger.info("Updating message...")
            await interaction.followup.edit_message(
                interaction.message.id,
                embed=embed,
                view=self
            )
            logger.info("Message updated successfully")

            await interaction.followup.send(
                "✅ Status refreshed!",
                ephemeral=True
            )
            logger.info("Refresh button completed successfully")

        except Exception as e:
            logger.error(f"❌ Error in refresh button: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            try:
                await interaction.followup.send(f"❌ Error refreshing: {e}", ephemeral=True)
            except Exception:
                logger.error("Failed to send error message to user")

    @ui.button(label='🧹 Cleanup', style=discord.ButtonStyle.secondary)
    async def cleanup_thread_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        import logging
        logger = logging.getLogger("app")

        # Get Discord ID and lookup user profile
        discord_id = str(interaction.user.id)
        logger.info(f"🧹 Cleanup button clicked by {interaction.user} (Discord ID: {discord_id})")

        # Try to lookup user in Supabase
        try:
            from ....api.supabase import user_manager
            user_profile = await user_manager.find_user_by_discord_id(discord_id)
            if user_profile:
                logger.info(f"   └─ Supabase user found: {user_profile.user_id} ({user_profile.email})")
            else:
                logger.info(f"   └─ No Supabase user profile found for Discord ID: {discord_id}")
        except Exception as e:
            logger.warning(f"   └─ Failed to lookup Supabase user: {e}")

        try:
            await interaction.response.defer()
            logger.info("Cleanup button interaction deferred")

            # Clean up old messages
            logger.info("Starting thread cleanup...")
            deleted_count = await self.__bot_instance.cleanup_thread_messages()
            logger.info(f"Thread cleanup completed, deleted {deleted_count} messages")

            await interaction.followup.send(
                f"🧹 Cleaned up {deleted_count} old messages from thread",
                ephemeral=True
            )
            logger.info("Cleanup button completed successfully")

        except Exception as e:
            logger.error(f"❌ Error in cleanup button: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            try:
                await interaction.followup.send(f"❌ Error cleaning up: {e}", ephemeral=True)
            except Exception:
                logger.error("Failed to send error message to user")

    @ui.button(label='🔄 Restart', style=discord.ButtonStyle.danger)
    async def restart_bot_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        import logging
        logger = logging.getLogger("app")

        # Get Discord ID and lookup user profile
        discord_id = str(interaction.user.id)
        logger.info(f"🔄 Restart button clicked by {interaction.user} (Discord ID: {discord_id})")

        # Try to lookup user in Supabase
        try:
            from ....api.supabase import user_manager
            user_profile = await user_manager.find_user_by_discord_id(discord_id)
            if user_profile:
                logger.info(f"   └─ Supabase user found: {user_profile.user_id} ({user_profile.email})")
            else:
                logger.info(f"   └─ No Supabase user profile found for Discord ID: {discord_id}")
        except Exception as e:
            logger.warning(f"   └─ Failed to lookup Supabase user: {e}")

        try:
            # Check if user has permission to restart
            if not self._has_restart_permission(interaction.user, interaction.guild):
                logger.info(f"User {interaction.user} denied restart permission")
                await interaction.response.send_message(
                    "❌ You don't have permission to restart the bot. Admin role required.",
                    ephemeral=True
                )
                return

            logger.info(f"User {interaction.user} has restart permission, proceeding...")
            await interaction.response.defer()

            # Update status to show pending restart
            old_text = self.status_text
            await self._show_pending_restart()
            embed = self.create_status_embed()
            await interaction.followup.edit_message(
                interaction.message.id, embed=embed, view=self
            )

            # Actually restart the bot
            await self.__bot_instance.restart_bot()

            # Wait a moment for restart to complete
            await asyncio.sleep(3)

            # Update with final status
            await self.refresh_status()
            embed = self.create_status_embed()
            await interaction.followup.edit_message(
                interaction.message.id, embed=embed, view=self
            )

        except Exception as e:
            # Restore original text if error
            if 'old_text' in locals():
                self.status_text = old_text
                embed = self.create_status_embed()
                await interaction.followup.edit_message(
                    interaction.message.id, embed=embed, view=self
                )

            if "starting or stopping" in str(e).lower():
                await interaction.followup.send(
                    "⏳ Bot is busy, please try again in a moment", ephemeral=True
                )
            else:
                await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

    def _has_restart_permission(self, user: discord.User, guild: Optional[discord.Guild]) -> bool:
        """Check if user has permission to restart the bot"""
        if not guild:
            return False

        member = guild.get_member(user.id)
        if not member:
            return False

        # Check if user has the admin role
        admin_role = guild.get_role(ADMIN_ROLE_ID)
        if admin_role and admin_role in member.roles:
            return True

        # Check if user is server owner
        if member == guild.owner:
            return True

        # Check if user has administrator permission
        if member.guild_permissions.administrator:
            return True

        return False

    async def refresh_status(self):
        """Refresh the status display with new color and image"""
        # Update status text
        self.status_text = self._get_status_text()

        # Get new status model
        status_model = self._get_bot_status_model()

        # Update thumbnail with state-appropriate image
        self.thumbnail_url = status_model.get_image_url()

        # Update embed color
        self.embed_color = status_model.get_health_based_color()

    @classmethod
    async def create_with_wolf_image(
        cls, bot_instance: 'DiscordBotService'
    ) -> 'BotStatusView':
        """Create status view with a random wolf image"""
        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get('https://random.dog/woof.json') as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        wolf_url = data.get('url', None)
                    else:
                        wolf_url = None
        except Exception:
            # Fallback to default if API fails
            wolf_url = None

        return cls(bot_instance, wolf_image_url=wolf_url)

    @classmethod
    async def create_master_server_view(
        cls, bot_instance: 'DiscordBotService', shard_id: Optional[int] = None
    ) -> 'BotStatusView':
        """Create status view for master server with shard-specific title"""
        view = cls(bot_instance)

        # Override the title to include shard information
        if shard_id is not None:
            view._master_server_shard_id = shard_id

        return view

    @classmethod
    async def create_shutdown_view(
        cls, bot_instance: 'DiscordBotService', shard_id: Optional[int] = None
    ) -> 'BotStatusView':
        """Create status view showing shutdown state for master server"""
        view = cls(bot_instance)

        # Override for shutdown display
        if shard_id is not None:
            view._master_server_shard_id = shard_id
            view._is_shutdown_view = True

        return view

    def create_status_embed(self) -> discord.Embed:
        """Create a Discord embed from the current status"""
        embed = discord.Embed(
            description=self.status_text,
            color=self.embed_color
        )
        embed.set_thumbnail(url=self.thumbnail_url)
        return embed


async def send_bot_status_embed(
    channel: discord.abc.Messageable, bot_instance: 'DiscordBotService'
) -> discord.Message:
    """
    Send a bot status embed to the specified channel

    Args:
        channel: Discord channel to send to
        bot_instance: Bot singleton instance

    Returns:
        The sent message
    """
    view = await BotStatusView.create_with_wolf_image(bot_instance)
    embed = view.create_status_embed()
    return await channel.send(embed=embed, view=view)
