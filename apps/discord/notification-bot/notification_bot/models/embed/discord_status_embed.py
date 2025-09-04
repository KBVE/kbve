from __future__ import annotations

import discord
from discord import ui
from typing import TYPE_CHECKING, Optional
import datetime
import asyncio
from ..constants import ADMIN_ROLE_ID
from ..status import BotStatusModel, StatusState

if TYPE_CHECKING:
    from ...api.discordbot import DiscordBotSingleton




class StatusControlButtons(ui.ActionRow):
    """Action row containing bot control buttons"""
    
    def __init__(self, view: 'BotStatusView', bot_instance: 'DiscordBotSingleton') -> None:
        self.__view = view
        self.__bot_instance = bot_instance
        super().__init__()

    @ui.button(label='🔄 Refresh', style=discord.ButtonStyle.primary)
    async def refresh_status(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        try:
            await interaction.response.defer()
            
            # Force refresh health data
            try:
                from ...utils.health_monitor import health_monitor
                await health_monitor.force_refresh()
            except Exception as e:
                import logging
                logging.warning(f"Failed to force refresh health data: {e}")
            
            # Refresh the status display
            await self.__view.refresh_status()
            
            # Update the message with new status and color
            await interaction.followup.edit_message(
                interaction.message.id, 
                view=self.__view
            )
            
            await interaction.followup.send(
                "✅ Status refreshed!", 
                ephemeral=True
            )
            
        except Exception as e:
            await interaction.followup.send(f"❌ Error refreshing: {e}", ephemeral=True)

    @ui.button(label='🧹 Cleanup', style=discord.ButtonStyle.secondary)
    async def cleanup_thread(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        try:
            await interaction.response.defer()
            
            # Clean up old messages
            deleted_count = await self.__bot_instance.cleanup_thread_messages()
            
            await interaction.followup.send(
                f"🧹 Cleaned up {deleted_count} old messages from thread", 
                ephemeral=True
            )
            
        except Exception as e:
            await interaction.followup.send(f"❌ Error cleaning up: {e}", ephemeral=True)

    @ui.button(label='🔄 Restart', style=discord.ButtonStyle.danger)
    async def restart_bot(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        try:
            # Check if user has permission to restart
            if not self._has_restart_permission(interaction.user, interaction.guild):
                await interaction.response.send_message(
                    "❌ You don't have permission to restart the bot. Admin role required.", 
                    ephemeral=True
                )
                return
                
            await interaction.response.defer()
            
            # Update status to show pending restart
            old_text = self.__view.status_text.content
            await self.__view._show_pending_restart()
            await interaction.followup.edit_message(interaction.message.id, view=self.__view)
            
            # Actually restart the bot
            await self.__bot_instance.restart_bot()
            
            # Wait a moment for restart to complete
            await asyncio.sleep(3)
            
            # Update with final status
            await self.__view.refresh_status()
            await interaction.followup.edit_message(interaction.message.id, view=self.__view)
            
        except Exception as e:
            # Restore original text if error
            if 'old_text' in locals():
                self.__view.status_text.content = old_text
                await interaction.followup.edit_message(interaction.message.id, view=self.__view)
                
            if "starting or stopping" in str(e).lower():
                await interaction.followup.send("⏳ Bot is busy, please try again in a moment", ephemeral=True)
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



class BotStatusView(ui.LayoutView):
    """Discord bot status display using LayoutView"""
    
    def __init__(self, bot_instance: 'DiscordBotSingleton', *, wolf_image_url: str = None) -> None:
        super().__init__()
        self.__bot_instance = bot_instance  # Store bot instance for status checks
        
        # Get current bot status model
        status_model = self._get_bot_status_model()
        
        # Use state-based image instead of wolf image
        state_image_url = status_model.get_image_url()
        
        # Initialize status text
        self.status_text = ui.TextDisplay(self._get_status_text())
        
        # Create thumbnail with state-appropriate image
        self.thumbnail = ui.Thumbnail(media=state_image_url)
        
        # Create section with status text and thumbnail
        self.section = ui.Section(self.status_text, accessory=self.thumbnail)
        
        # Create control buttons
        self.buttons = StatusControlButtons(self, bot_instance)
        
        # Use health-based color for container (overrides state color if unhealthy)
        color = status_model.get_health_based_color()
        
        # Create container with all components
        container = ui.Container(self.section, self.buttons, accent_color=color)
        self.add_item(container)
    
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
    
    def _get_status_text(self) -> str:
        """Generate status text based on bot state with health metrics"""
        status_model = self._get_bot_status_model()
        
        # Get health status indicator
        health_emoji = "🟢" if status_model.health_status == "HEALTHY" else "🟡" if status_model.health_status == "WARNING" else "🔴"
        
        # Get cache age info (if available)
        try:
            status_with_health = self.__bot_instance.get_status_with_health()
            health_data = status_with_health["health_data"]
            cache_age = health_data.get("cache_age_seconds", 0)
            cache_info = f" (cached {cache_age}s ago)" if cache_age > 0 else " (fresh)"
        except:
            cache_info = ""
        
        lines = [
            "🤖 **Discord Bot Status Dashboard**",
            "",
            f"**Status:** {status_model.get_emoji()} {status_model.get_status_description()}",
            f"**Health:** {health_emoji} {status_model.health_status}",
            f"**Initialized:** {'Yes' if status_model.initialized else 'No'}",
            f"**Ready:** {'Yes' if status_model.is_ready else 'No'}",
            f"**Guild Count:** {status_model.guild_count}",
            "",
            f"**💾 System Resources{cache_info}:**",
            f"• Memory: {status_model.memory_usage_mb:.1f}MB ({status_model.memory_percent:.1f}%)",
            f"• CPU: {status_model.cpu_percent:.1f}%",
            f"• Threads: {status_model.thread_count}",
            f"• Uptime: {status_model.uptime_formatted}",
            "",
            f"**State Flags:**",
            f"• Starting: {'Yes' if status_model.is_starting else 'No'}",
            f"• Stopping: {'Yes' if status_model.is_stopping else 'No'}",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ]
        
        return "\n".join(lines)
    
    def _get_pending_online_text(self) -> str:
        """Generate pending online text"""
        lines = [
            "🤖 **Discord Bot Status Dashboard**",
            "",
            f"**Status:** 🟡 Coming Online...",
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
            f"**Status:** 🟠 Going Offline...",
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
            f"**Status:** 🟡 Restarting...",
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
        self.status_text.content = self._get_pending_restart_text()
        
        # Use pending/starting state for color and image
        pending_color = StatusState.STARTING.color
        pending_image = StatusState.STARTING.image_url
        
        # Update thumbnail with pending image
        self.thumbnail = ui.Thumbnail(media=pending_image)
        
        # Recreate the container with pending color
        self.clear_items()
        
        # Recreate section with updated thumbnail and buttons
        self.section = ui.Section(self.status_text, accessory=self.thumbnail)
        self.buttons = StatusControlButtons(self, self.__bot_instance)
        
        # Create new container with pending color
        container = ui.Container(self.section, self.buttons, accent_color=pending_color)
        self.add_item(container)
    
    def _get_status_color(self) -> discord.Color:
        """Get container color based on bot status and health"""
        status_model = self._get_bot_status_model()
        return status_model.get_health_based_color()
    
    async def refresh_status(self):
        """Refresh the status display with new color and image"""
        # Update status text
        self.status_text.content = self._get_status_text()
        
        # Get new status model
        status_model = self._get_bot_status_model()
        
        # Update thumbnail with state-appropriate image
        self.thumbnail = ui.Thumbnail(media=status_model.get_image_url())
        
        # Recreate the container with new color and image
        self.clear_items()
        
        # Recreate section with updated thumbnail and buttons
        self.section = ui.Section(self.status_text, accessory=self.thumbnail)
        self.buttons = StatusControlButtons(self, self.__bot_instance)
        
        # Create new container with updated health-based color
        container = ui.Container(self.section, self.buttons, accent_color=status_model.get_health_based_color())
        self.add_item(container)
    
    @classmethod
    async def create_with_wolf_image(cls, bot_instance: 'DiscordBotSingleton') -> 'BotStatusView':
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


async def send_bot_status_embed(channel: discord.abc.Messageable, bot_instance: 'DiscordBotSingleton') -> discord.Message:
    """
    Send a bot status embed to the specified channel
    
    Args:
        channel: Discord channel to send to
        bot_instance: Bot singleton instance
        
    Returns:
        The sent message
    """
    view = await BotStatusView.create_with_wolf_image(bot_instance)
    return await channel.send(view=view)