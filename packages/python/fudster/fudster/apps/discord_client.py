import os
import logging
import re
from asyncio import sleep

from .chrome_client import ChromeClient

logger = logging.getLogger("uvicorn")


class DiscordClient:
    def __init__(self, headless=True, display=":1"):
        self.headless = headless
        self.display = display
        self.chrome_client = ChromeClient(headless=headless, display=display)

    async def login_with_passkey(self, discord_url="https://discord.com/login", passkey=None, retries=3):
        """
        Logs into Discord by injecting the passkey into localStorage.
        """
        passkey = passkey or os.getenv("DISCORD_PASSKEY")
        if not passkey:
            raise ValueError(
                "Passkey not provided. Set it as an argument "
                "or in the DISCORD_PASSKEY environment variable."
            )

        if not re.match(r"^[A-Za-z0-9_\-\.]+$", passkey):
            raise ValueError(
                "Invalid token format. Discord tokens should be "
                "alphanumeric with optional underscores, hyphens, or dots."
            )

        for attempt in range(retries):
            try:
                logger.info(f"Attempt {attempt + 1} to log into Discord")
                await self.chrome_client.start_chrome_async()

                logger.info(f"Opening Discord URL: {discord_url}")
                await self.chrome_client.perform_task_with_chrome(discord_url)

                logger.info("Injecting passkey into localStorage")
                js = "window.localStorage.setItem('token', '"
                js += passkey + "')"
                self.chrome_client.sb.execute_script(js)

                logger.info("Refreshing the page to apply the token")
                self.chrome_client.sb.refresh()

                logger.info("Checking for successful login")
                if self.chrome_client.sb.is_element_visible('[data-testid="user-settings"]', timeout=10):
                    logger.info("Discord login verified successfully.")
                    return "Logged into Discord using passkey successfully."
                else:
                    logger.warning("Failed to verify Discord login.")
                    return "Failed to verify Discord login."
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < retries - 1:
                    await sleep(2)
                else:
                    raise e
            finally:
                await self.chrome_client.stop_chrome_async()

    async def verify_login(self):
        """
        Verifies if the user is logged into Discord.
        """
        try:
            if self.chrome_client.sb.is_element_visible('[data-testid="user-settings"]'):
                logger.info("Discord login verified successfully.")
                return True
            else:
                logger.warning("Discord login verification failed.")
                return False
        except Exception as e:
            logger.error(f"Failed to verify login: {e}")
            return False

    async def fetch_discord_data(self):
        """
        Fetches data from Discord after login.
        """
        try:
            guild_url = "https://discord.com/channels/@me"
            await self.chrome_client.perform_task_with_chrome(guild_url)

            user_data = self.chrome_client.sb.get_text('[data-testid="user-settings"]')
            logger.info(f"Fetched user data: {user_data}")
            return user_data
        except Exception as e:
            logger.error(f"Failed to fetch Discord data: {e}")
            return f"Failed to fetch Discord data: {e}"

    async def close(self):
        pass
