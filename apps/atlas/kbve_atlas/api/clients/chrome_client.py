import asyncio
import logging
from seleniumbase import BaseCase, SB
from selenium.webdriver.chrome.options import Options
from seleniumbase.common.exceptions import NoSuchElementException, TimeoutException
from pyvirtualdisplay import Display

logger = logging.getLogger("uvicorn")

class ChromeClient(BaseCase):
    def __init__(self, headless=False, display=":1"):
        self.headless = headless
        self.driver = None
        self.display = display
        self.virtual_display = None

    async def start_virtual_display(self):
        try:
            self.virtual_display = Display(visible=0, size=(1920, 1080), use_xauth=True)
            self.virtual_display.start()
            logger.info("Virtual display started successfully.")
        except Exception as e:
            logger.error(f"Failed to start virtual display: {e}")
            raise

    async def stop_virtual_display(self):
        if self.virtual_display:
            self.virtual_display.stop()
            logger.info("Virtual display stopped successfully.")

    async def start_chrome_async(self):
            try:
                await self.start_virtual_display()
                self.sb = SB(uc=True, test=True, headless=self.headless, browser="chrome", binary_location="/usr/bin/chromium-browser")
                self.driver = self.sb.driver
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
        await self.start_virtual_display()

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
            await self.stop_virtual_display()
            return f"Failed to perform task: {e}"

        # Stop Chromedriver
        stop_message = await self.stop_chrome_async()
        logger.info(stop_message)

        await self.stop_virtual_display()
        return "Chromedriver task completed and stopped successfully."

    async def go_to_gitlab(self):
        await self.start_virtual_display()

        try:   
            options = ["--no-sandbox", "--disable-dev-shm-usage"]
            if self.headless:
                options.append("--headless")

            with SB(uc=True, test=True, headless=self.headless, browser="chrome", binary_location="/usr/bin/chromium-browser") as sb:
                # Set custom options
                for option in options:
                    sb.driver.options.add_argument(option)

                # Ensure the headless setting is correctly applied
                if self.headless:
                    sb.driver.options.add_argument("--headless")
                else:
                    sb.driver.options.headless = False

                # Navigate to GitLab sign-in page
                url = "https://gitlab.com/users/sign_in"
                for attempt in range(3):  # Try up to 3 times
                    try:
                        sb.driver.uc_open_with_reconnect(url, 3)
                        if not sb.is_text_visible("Username", '[for="user_login"]'):
                            raise TimeoutException("Username field not visible.")
                        sb.assert_text("Username", '[for="user_login"]', timeout=3)
                        sb.assert_element('label[for="user_login"]')
                        sb.highlight('button:contains("Sign in")')
                        sb.highlight('h1:contains("GitLab.com")')
                        sb.post_message("SeleniumBase wasn't detected", duration=4)
                        logger.info("Navigated to GitLab sign-in page successfully.")
                        return "Navigated to GitLab sign-in page and closed successfully."
                    except (NoSuchElementException, TimeoutException) as e:
                        logger.warning(f"Attempt {attempt + 1} failed: {e}")
                        if attempt == 2:  # Last attempt
                            raise

        except Exception as e:
            logger.error(f"Failed to navigate to GitLab sign-in page: {e}")
            return f"Failed to navigate to GitLab sign-in page: {e}"
        finally:
            await self.stop_virtual_display()

    async def close(self):
        # This method is required by the KRDecorator's pattern, even if it does nothing
        pass
