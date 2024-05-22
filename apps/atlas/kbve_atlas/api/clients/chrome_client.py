import asyncio
import logging
import os
from seleniumbase import BaseCase, SB
from seleniumbase.common.exceptions import NoSuchElementException, TimeoutException

logger = logging.getLogger("uvicorn")

class ChromeClient(BaseCase):
    def __init__(self, headless=False, display=":1"):
        self.headless = headless
        self.driver = None
        self.display = display

    def set_display(self):
        os.environ["DISPLAY"] = self.display
        logger.info(f"Using display {self.display}")

    async def start_chrome_async(self):
        try:
            self.set_display()
            self.sb = SB(uc=True, headless=self.headless, browser="chrome", binary_location="/usr/bin/chromium-browser")
            self.driver = self.sb.get_new_driver(browser="chrome", headless=self.headless)
            logger.info("Chromedriver started successfully using SeleniumBase.")
            return "Chromedriver started successfully using SeleniumBase."
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
        self.set_display()

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
        self.set_display()

        try:
            options = ["--no-sandbox", "--disable-dev-shm-usage"]
            if self.headless:
                options.append("--headless")

            self.sb = SB(uc=True, headless=self.headless, browser="chrome", binary_location="/usr/bin/chromium-browser")
            self.driver = self.sb.get_new_driver(browser="chrome", headless=self.headless)

            for option in options:
                self.driver.options.add_argument(option)

            # Navigate to GitLab sign-in page
            url = "https://gitlab.com/users/sign_in"
            for attempt in range(3):  # Try up to 3 times
                try:
                    await asyncio.to_thread(self.driver.get, url)
                    if not self.sb.is_text_visible("Username", '[for="user_login"]'):
                        raise TimeoutException("Username field not visible.")
                    self.sb.assert_text("Username", '[for="user_login"]', timeout=3)
                    self.sb.assert_element('label[for="user_login"]')
                    self.sb.highlight('button:contains("Sign in")')
                    self.sb.highlight('h1:contains("GitLab.com")')
                    self.sb.post_message("SeleniumBase wasn't detected", duration=4)
                    logger.info("Navigated to GitLab sign-in page successfully.")
                    return "Navigated to GitLab sign-in page successfully."
                except (NoSuchElementException, TimeoutException) as e:
                    logger.warning(f"Attempt {attempt + 1} failed: {e}")
                    if attempt == 2:  # Last attempt
                        raise

        except Exception as e:
            logger.error(f"Failed to navigate to GitLab sign-in page: {e}")
            return f"Failed to navigate to GitLab sign-in page: {e}"
        finally:
            await self.stop_chrome_async()

    async def close(self):
        # This method is required by the KRDecorator's pattern, even if it does nothing
        pass
