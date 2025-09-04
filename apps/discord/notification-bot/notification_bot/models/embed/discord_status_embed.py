from __future__ import annotations

import discord
from discord import ui
from typing import TYPE_CHECKING, Optional
import datetime
import asyncio

if TYPE_CHECKING:
    from ...api.discordbot import DiscordBotSingleton


class StatusControlButtons(ui.ActionRow):
    """Action row containing bot control buttons"""
    
    def __init__(self, view: 'BotStatusView', bot_instance: 'DiscordBotSingleton') -> None:
        self.__view = view
        self.__bot_instance = bot_instance
        super().__init__()

    @ui.button(label='🟢 Online', style=discord.ButtonStyle.success)
    async def bring_online(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        try:
            await self.__bot_instance.bring_online()
            await self.__view.refresh_status()
            await interaction.response.edit_message(view=self.__view)
        except Exception as e:
            if "already" in str(e).lower():
                await interaction.response.send_message(f"ℹ️ {e}", ephemeral=True)
            else:
                await interaction.response.send_message(f"❌ Error: {e}", ephemeral=True)

    @ui.button(label='🔴 Offline', style=discord.ButtonStyle.danger)
    async def take_offline(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        try:
            await self.__bot_instance.stop_bot(send_message=True)
            await self.__view.refresh_status()
            await interaction.response.edit_message(view=self.__view)
        except Exception as e:
            await interaction.response.send_message(f"❌ Error: {e}", ephemeral=True)

    @ui.button(label='🔄 Restart', style=discord.ButtonStyle.secondary)
    async def restart_bot(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        try:
            await interaction.response.defer()
            await self.__bot_instance.restart_bot()
            await self.__view.refresh_status()
            await interaction.followup.edit_message(interaction.message.id, view=self.__view)
        except Exception as e:
            if "starting or stopping" in str(e).lower():
                await interaction.followup.send("⏳ Bot is busy, please try again in a moment", ephemeral=True)
            else:
                await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

    @ui.button(label='📊 Refresh', style=discord.ButtonStyle.primary)
    async def refresh_status(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await self.__view.refresh_status()
        await interaction.response.edit_message(view=self.__view)


class BotStatusView(ui.LayoutView):
    """Discord bot status display using LayoutView"""
    
    def __init__(self, bot_instance: 'DiscordBotSingleton', *, wolf_image_url: str = None) -> None:
        super().__init__()
        self.__bot_instance = bot_instance
        
        # Default wolf image URL (can be replaced later)
        default_wolf_url = wolf_image_url or "https://random.dog/woof.json"
        
        # Initialize status text
        self.status_text = ui.TextDisplay(self._get_status_text())
        
        # Create thumbnail with wolf image
        self.thumbnail = ui.Thumbnail(media=default_wolf_url)
        
        # Create section with status text and thumbnail
        self.section = ui.Section(self.status_text, accessory=self.thumbnail)
        
        # Create control buttons
        self.buttons = StatusControlButtons(self, bot_instance)
        
        # Determine container color based on bot status
        color = self._get_status_color()
        
        # Create container with all components
        container = ui.Container(self.section, self.buttons, accent_color=color)
        self.add_item(container)
    
    def _get_status_text(self) -> str:
        """Generate status text based on bot state"""
        status = self.__bot_instance.get_status()
        
        lines = [
            "🤖 **Discord Bot Status Dashboard**",
            "",
            f"**Status:** {self._get_status_emoji(status)} {self._get_status_description(status)}",
            f"**Initialized:** {'Yes' if status['initialized'] else 'No'}",
            f"**Ready:** {'Yes' if status['is_ready'] else 'No'}",
            f"**Guild Count:** {status['guild_count']}",
            "",
            f"**State Flags:**",
            f"• Starting: {'Yes' if status['is_starting'] else 'No'}",
            f"• Stopping: {'Yes' if status['is_stopping'] else 'No'}",
            "",
            f"**Last Updated:** {datetime.datetime.now().strftime('%H:%M:%S')}"
        ]
        
        return "\n".join(lines)
    
    def _get_status_emoji(self, status: dict) -> str:
        """Get emoji for current status"""
        if status['is_starting']:
            return "🟡"
        elif status['is_stopping']:
            return "🟠"
        elif status['is_ready']:
            return "🟢"
        elif status['initialized'] and not status['is_closed']:
            return "🟡"
        else:
            return "🔴"
    
    def _get_status_description(self, status: dict) -> str:
        """Get human-readable status description"""
        if status['is_starting']:
            return "Starting..."
        elif status['is_stopping']:
            return "Stopping..."
        elif status['is_ready']:
            return "Online & Ready"
        elif status['initialized'] and not status['is_closed']:
            return "Initialized but not ready"
        else:
            return "Offline"
    
    def _get_status_color(self) -> discord.Color:
        """Get container color based on bot status"""
        status = self.__bot_instance.get_status()
        
        if status['is_starting'] or status['is_stopping']:
            return discord.Color.orange()
        elif status['is_ready']:
            return discord.Color.green()
        elif status['initialized'] and not status['is_closed']:
            return discord.Color.yellow()
        else:
            return discord.Color.red()
    
    async def refresh_status(self):
        """Refresh the status display"""
        # Update status text
        self.status_text.content = self._get_status_text()
        
        # Update container color
        new_color = self._get_status_color()
        # Note: Container color can't be changed after creation in current discord.py
        # This would require recreating the container, which is more complex
    
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