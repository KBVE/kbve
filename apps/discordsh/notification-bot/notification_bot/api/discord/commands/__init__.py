"""
Discord bot command modules
"""
from .bot_online import router as bot_online_router
from .bot_offline import router as bot_offline_router
from .bot_restart import router as bot_restart_router
from .bot_force_restart import router as bot_force_restart_router
from .cleanup_thread import router as cleanup_thread_router
from .health import router as health_router

__all__ = [
    'bot_online_router',
    'bot_offline_router',
    'bot_restart_router',
    'bot_force_restart_router',
    'cleanup_thread_router',
    'health_router'
]
