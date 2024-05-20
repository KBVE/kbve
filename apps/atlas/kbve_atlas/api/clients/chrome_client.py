import asyncio
import logging
from seleniumbase import BaseCase, get_driver, Driver, SB
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options

logger = logging.getLogger("uvicorn")

class ChromeClient(BaseCase):
    def __init__(self, headless=False):
        self.headless = headless
        self.driver = None

    async def start_chrome_async(self):
        try:
            options = Options()
            if self.headless:
                options.add_argument("--headless")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            self.driver = await asyncio.to_thread(get_driver, "chrome", headless=self.headless, options=options)
            logger.info("Chromedriver started successfully.")
            return "Chromedriver started successfully."
        except Exception as e:
            logger.error(f"Failed to start Chromedriver: {e}")
            return f"Failed to start Chromedriver: {e}"

    async def stop_chrome_async(self):
        try:
            if self.driver:
                await asyncio.to_thread(self.driver.quit)
                logger.info("Chromedriver stopped successfully.")
                return "Chromedriver stopped successfully."
            else:
                logger.error("Chromedriver instance not found.")
                return "Failed to stop Chromedriver: instance not found."
        except Exception as e:
            logger.error(f"Failed to stop Chromedriver: {e}")
            return f"Failed to stop Chromedriver: {e}"

    async def perform_task_with_chrome(self, task_url):
        # Start Chromedriver
        start_message = await self.start_chrome_async()
        logger.info(start_message)

        # Perform the desired task
        try:
            await asyncio.to_thread(self.driver.get, task_url)
            logger.info(f"Task completed successfully: navigated to {task_url}")
        except Exception as e:
            logger.error(f"Failed to perform task: {e}")
            await self.stop_chrome_async()
            return f"Failed to perform task: {e}"

        # Stop Chromedriver
        stop_message = await self.stop_chrome_async()
        logger.info(stop_message)

        return "Chromedriver task completed and stopped successfully."

    async def go_to_gitlab(self):
        try:
            async def navigate_to_gitlab():
                with SB(uc=True, test=True, headless=self.headless, browser="chrome") as sb:
                    if self.headless:
                        sb.driver.options.add_argument("--headless")
                    sb.driver.options.add_argument("--no-sandbox")
                    sb.driver.options.add_argument("--disable-dev-shm-usage")
                    sb.driver.options.binary_location = "/usr/bin/chromium-browser"
                    
                    url = "https://gitlab.com/users/sign_in"
                    sb.driver.uc_open_with_reconnect(url, 3)
                    if not sb.is_text_visible("Username", '[for="user_login"]'):
                        sb.driver.uc_open_with_reconnect(url, 4)
                    sb.assert_text("Username", '[for="user_login"]', timeout=3)
                    sb.assert_element('label[for="user_login"]')
                    sb.highlight('button:contains("Sign in")')
                    sb.highlight('h1:contains("GitLab.com")')
                    sb.post_message("SeleniumBase wasn't detected", duration=4)

            await asyncio.to_thread(navigate_to_gitlab)
            logger.info("Navigated to GitLab sign-in page successfully.")
            return "Navigated to GitLab sign-in page and closed successfully."
        except Exception as e:
            logger.error(f"Failed to navigate to GitLab sign-in page: {e}")
            return f"Failed to navigate to GitLab sign-in page: {e}"



    async def close(self):
        # This method is required by the KRDecorator's pattern, even if it does nothing
        pass
