import asyncio
import logging
import undetected_chromedriver as uc

logger = logging.getLogger("uvicorn")

class ChromeClient:
    def __init__(self, headless=False):
        self.headless = headless
        self.driver = None
    async def start_chrome_async(self):
        try:
            self.driver = await asyncio.to_thread(uc.Chrome, use_subprocess=True, headless=self.headless, browser_executable_path="/usr/bin/chromium-browser", driver_executable_path="/usr/lib/chromium-browser/chromedriver")
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

    async def close(self):
        # This method is required by the KRDecorator's pattern, even if it does nothing
        pass