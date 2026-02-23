"""
Bot offline command module - Manual Dishka resolution
"""
import asyncio
import os
import signal
from fastapi import APIRouter, Request
from ....api.discord.discord_service import DiscordBotService
from ....models.responses import StandardResponse

router = APIRouter()


async def _shutdown_app():
    """Shutdown the application gracefully"""
    await asyncio.sleep(1)
    os.kill(os.getpid(), signal.SIGTERM)


@router.post("/bot-offline", response_model=StandardResponse)
async def take_bot_offline(request: Request, shutdown_app: bool = False) -> StandardResponse:
    """Take Discord bot offline with optional application shutdown"""
    try:
        # Manual Dishka container resolution
        container = request.app.state.dishka_container
        async with container() as request_container:
            discord_bot = await request_container.get(DiscordBotService)

            await discord_bot.stop_bot(send_message=True)

            if shutdown_app:
                asyncio.create_task(_shutdown_app())
                return {"status": "success", "message": "Discord bot taken offline. Application will shutdown."}
            else:
                return {"status": "success", "message": "Discord bot taken offline"}
    except Exception as e:
        if "already" in str(e).lower():
            return {"status": "info", "message": str(e)}
        return {"status": "error", "message": str(e)}


@router.post("/sign-off", response_model=StandardResponse)
async def sign_off(request: Request) -> StandardResponse:
    """Gracefully shut down the Discord bot and exit the application"""
    return await take_bot_offline(request, shutdown_app=True)
