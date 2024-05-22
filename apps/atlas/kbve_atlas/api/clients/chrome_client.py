import asyncio
import logging
import os
from seleniumbase import SB
from seleniumbase.common.exceptions import NoSuchElementException, TimeoutException

logger = logging.getLogger("uvicorn")

class ChromeClient:
    def __init__(self, headless=False, display=":1"):
        self.headless = headless
        self.display = display
        self.sb = None  # Initialize the sb attribute

    def set_display(self):
        os.environ["DISPLAY"] = self.display
        logger.info(f"Using display {self.display}")

    def click_turnstile_and_verify(self):
        self.sb.switch_to_frame("iframe")
        self.sb.driver.uc_click("span")
        self.sb.assert_element("img#captcha-success", timeout=3)

    def open_the_turnstile_page(self, url):
        self.sb.driver.uc_open_with_reconnect(url, reconnect_time=2)

    async def start_chrome_async(self):
        try:
            self.set_display()
            self.sb = SB(uc=True, headless=self.headless, browser="chrome", headed=True)
            logger.info("Chromedriver started successfully using SeleniumBase.")
            return "Chromedriver started successfully using SeleniumBase."
        except Exception as e:
            logger.error(f"Failed to start Chromedriver: {e}")
            return f"Failed to start Chromedriver: {e}"

    async def stop_chrome_async(self):
        try:
            self.sb.__exit__(None, None, None)  # Ensure the context manager is exited
            logger.info("Chromedriver stopped successfully.")
            return "Chromedriver stopped successfully."
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
            await asyncio.to_thread(self.sb.open, task_url)
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
            with SB(uc=True, headless=self.headless, browser="chrome", headed=True) as sb:
                self.sb = sb
                # Navigate to GitLab sign-in page
                url = "https://gitlab.com/users/sign_in"
                for attempt in range(3):  # Try up to 3 times
                    try:
                        self.open_the_turnstile_page(url)
                        try:
                            self.click_turnstile_and_verify()
                        except Exception:
                            self.open_the_turnstile_page(url)
                            self.click_turnstile_and_verify()
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
