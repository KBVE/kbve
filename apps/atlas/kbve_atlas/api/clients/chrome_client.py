import asyncio
import logging
from seleniumbase import BaseCase
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

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
            options.binary_location = "/usr/bin/chromium-browser"
            self.driver = await asyncio.to_thread(self.create_driver, ChromeDriverManager().install(), options)
            logger.info("Chromedriver started successfully.")
            return "Chromedriver started successfully."
        except Exception as e:
            logger.error(f"Failed to start Chromedriver: {e}")
            return f"Failed to start Chromedriver: {e}"

    def create_driver(self, executable_path, options):
        service = ChromeService(executable_path=executable_path)
        return self.get_new_driver(service=service, options=options)

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

    async def close(self):
        # This method is required by the KRDecorator's pattern, even if it does nothing
        pass
