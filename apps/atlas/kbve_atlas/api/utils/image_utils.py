import os
import aiohttp
import cv2
import logging
import asyncio

from aiohttp import ClientTimeout

logger = logging.getLogger("uvicorn")

class ImageUtility:
    def __init__(self, cache_dir="image_cache", timeout=10):
        self.cache_dir = cache_dir
        self.timeout = timeout  # timeout in seconds
        self.ensure_cache_dir_exists()

    def ensure_cache_dir_exists(self):
        """Ensure that the cache directory exists."""
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)
            logger.info(f"Created cache directory at: {self.cache_dir}")

    async def download_and_cache_image_async(self, url):
        """Asynchronous method to download and cache image."""
        return await self._download_and_cache_image(url)

    def download_and_cache_image(self, url):
        """Synchronous wrapper around the asynchronous download method."""
        return asyncio.run(self._download_and_cache_image(url))

    async def _download_and_cache_image(self, url):
        """Core asynchronous method to download and cache an image using aiohttp."""
        image_name = url.split('/')[-1]
        cache_path = os.path.join(self.cache_dir, image_name)
        
        if not os.path.exists(cache_path):
            logger.debug(f"Downloading image: {url}")
            try:
                timeout = ClientTimeout(total=self.timeout)  # Configure timeout
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(url) as response:
                        response.raise_for_status()
                        content = await response.read()

                with open(cache_path, 'wb') as f:
                    f.write(content)
                logger.info(f"Downloaded and cached {image_name} at {cache_path}")
            except aiohttp.ClientError as e:
                logger.error(f"HTTP Client Error when downloading {url}: {str(e)}")
                raise
            except asyncio.TimeoutError:
                logger.error(f"Timeout occurred while downloading {url}")
                raise
        else:
            logger.debug(f"Image already cached: {image_name}")

        return cache_path

    def load_image(self, path):
        """Load an image from a specified path using OpenCV."""
        return cv2.imread(path)
