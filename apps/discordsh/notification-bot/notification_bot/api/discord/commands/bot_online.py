"""
Bot online command module - Manual Dishka resolution
"""
import logging
from fastapi import APIRouter, Request
from ....api.discord.discord_service import DiscordBotService
from ....models.responses import StandardResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/bot-online", response_model=StandardResponse)
async def bring_bot_online(request: Request) -> StandardResponse:
    """Bring Discord bot online if it's offline"""
    try:
        # Manual Dishka container resolution
        container = request.app.state.dishka_container
        async with container() as request_container:
            discord_bot = await request_container.get(DiscordBotService)

            await discord_bot.bring_online()
            return {"status": "success", "message": "Discord bot is coming online"}
    except Exception as e:
        logger.exception("Failed to bring Discord bot online")
        if "already" in str(e).lower():
            return {"status": "info", "message": "Discord bot is already online"}
        return {"status": "error", "message": "Failed to bring Discord bot online"}
