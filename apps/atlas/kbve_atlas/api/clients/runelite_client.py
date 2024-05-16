import subprocess
import os
import asyncio
import logging

logger = logging.getLogger("uvicorn")

class RuneLiteClient:
    def __init__(self, display=":20", jar_path="/usr/local/bin/runelite.jar"):
        self.display = display
        self.jar_path = jar_path

    async def start_runelite_async(self):
        env = os.environ.copy()
        env["DISPLAY"] = self.display
        try:
            # Since subprocess.run is not async, use asyncio to run it in a thread pool
            await asyncio.to_thread(
                subprocess.run, ["java", "-jar", self.jar_path], env=env
            )
            logger.info("RuneLite started successfully.")
            return "RuneLite started successfully."
        except Exception as e:
            logger.error(f"Failed to start RuneLite: {e}")
            return f"Failed to start RuneLite: {e}"

    async def close(self):
        # This method is required by the KRDecorator's pattern, even if it does nothing
        pass
