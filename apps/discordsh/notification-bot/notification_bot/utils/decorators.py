"""
Developer-friendly decorators for ultra-fast endpoints with minimal boilerplate
"""
from functools import wraps
from typing import Callable
from fastapi import Response
from .fast_responses import success_response, error_response, info_response
from notification_bot.utils.logger import logger


def auto_response(func: Callable) -> Callable:
    """
    Automatically wrap endpoint responses with optimized JSON handling

    Usage:
        @router.post("/endpoint")
        @auto_response
        async def endpoint(bot: BotService) -> str:
            await bot.action()
            return "Action completed"  # Auto-wrapped in StandardResponse
    """
    @wraps(func)
    async def wrapper(*args, **kwargs) -> Response:
        try:
            result = await func(*args, **kwargs)

            # If function returns a Response, pass it through
            if isinstance(result, Response):
                return result

            # If function returns a string, wrap in success response
            if isinstance(result, str):
                return success_response(result)

            # If function returns a dict with status, handle appropriately
            if isinstance(result, dict):
                if result.get("status") == "info":
                    return info_response(result.get("message", "Info"))
                elif result.get("status") == "error":
                    return error_response(
                        result.get("message", "Error"),
                        result.get("status_code", 500)
                    )
                else:
                    return success_response(
                        result.get("message", "Success"),
                        result.get("data")
                    )

            # Default: wrap result in success response
            return success_response("Operation completed successfully")

        except Exception as e:
            logger.error(f"Error in {func.__name__}: {e}")

            # Handle known error patterns
            if "already" in str(e).lower():
                return info_response(str(e))
            elif "not found" in str(e).lower():
                return error_response(str(e), 404)
            elif "permission" in str(e).lower() or "unauthorized" in str(e).lower():
                return error_response(str(e), 403)
            else:
                return error_response(str(e))

    return wrapper


def bot_action(success_message: str = None):
    """
    Decorator for bot action endpoints with custom success messages

    Usage:
        @router.post("/restart")
        @bot_action("Bot restarted successfully")
        async def restart_bot(bot: BotService):
            await bot.restart()
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Response:
            try:
                result = await func(*args, **kwargs)

                # If function already returned a Response, use it
                if isinstance(result, Response):
                    return result

                # Use custom success message or default
                message = success_message or f"{func.__name__.replace('_', ' ').title()} completed successfully"
                return success_response(message)

            except Exception as e:
                logger.error(f"Bot action {func.__name__} failed: {e}")

                # Smart error handling for bot operations
                if "starting or stopping" in str(e).lower():
                    return error_response("Bot is currently busy, please try again in a moment", 409)
                elif "not ready" in str(e).lower():
                    return error_response("Discord bot is not ready", 503)
                elif "already" in str(e).lower():
                    return info_response(str(e))
                else:
                    return error_response(str(e))

        return wrapper
    return decorator


def require_ready_bot(func: Callable) -> Callable:
    """
    Decorator to ensure bot is ready before executing endpoint

    Usage:
        @router.post("/cleanup")
        @require_ready_bot
        async def cleanup(bot: BotService):
            # Bot readiness automatically checked
            return await bot.cleanup()
    """
    @wraps(func)
    async def wrapper(*args, **kwargs) -> Response:
        # Find BotService in args/kwargs
        bot_service = None

        # Check args for BotService
        for arg in args:
            if hasattr(arg, 'get_bot'):
                bot_service = arg
                break

        # Check kwargs for BotService
        if not bot_service:
            for value in kwargs.values():
                if hasattr(value, 'get_bot'):
                    bot_service = value
                    break

        if not bot_service:
            return error_response("Bot service not found in request", 500)

        # Check if bot is ready
        bot = bot_service.get_bot()
        if not bot or not bot.is_ready():
            return error_response("Discord bot is not ready", 503)

        # Execute the original function
        return await func(*args, **kwargs)

    return wrapper


def with_error_context(context: str):
    """
    Add contextual information to errors

    Usage:
        @router.get("/user/{user_id}")
        @with_error_context("user management")
        async def get_user(user_id: str):
            # Errors will include "Error in user management: ..."
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Response:
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Error in {context} ({func.__name__}): {e}")
                return error_response(f"Error in {context}: {str(e)}")

        return wrapper
    return decorator


def log_execution(func: Callable) -> Callable:
    """
    Log endpoint execution for monitoring

    Usage:
        @router.post("/important-action")
        @log_execution
        async def important_action():
            # Execution will be logged
    """
    @wraps(func)
    async def wrapper(*args, **kwargs) -> Response:
        logger.info(f"Executing {func.__name__}")

        try:
            result = await func(*args, **kwargs)
            logger.info(f"Successfully executed {func.__name__}")
            return result
        except Exception as e:
            logger.error(f"Failed to execute {func.__name__}: {e}")
            raise

    return wrapper
