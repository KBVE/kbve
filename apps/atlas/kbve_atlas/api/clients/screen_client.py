import pyautogui
import cv2
import numpy as np
import logging
import os
from humancursor import SystemCursor
from ...api.utils import ImageUtility

logger = logging.getLogger("uvicorn")

class ScreenClient:
    def __init__(self, image_url, timeout=5):
        self.image_url = image_url
        self.image_util = ImageUtility(timeout=timeout)

    async def find_and_click_image(self):

        os.environ['DISPLAY'] = ':20'

        try:
            image_path = await self.image_util.download_and_cache_image_async(self.image_url)
            template = cv2.imread(image_path)
            if template is None:
                error_msg = f"Failed to load image for path: {image_path}"
                logger.error(error_msg)
                return error_msg

            screen = pyautogui.screenshot()
            screen = cv2.cvtColor(np.array(screen), cv2.COLOR_RGB2BGR)

            result = cv2.matchTemplate(screen, template, cv2.TM_CCOEFF_NORMED)
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

            # Define a threshold for template matching confidence
            threshold = 0.8  # You can adjust this value according to your needs
            if max_val >= threshold:
                click_x, click_y = max_loc
                cursor = SystemCursor()
                cursor.click_on([click_x, click_y])  # or use pyautogui.click(click_x, click_y)
                logger.info(f"Clicked at position: ({click_x}, {click_y})")
                return "Click successful"
            else:
                error_msg = "Image not found with sufficient confidence."
                logger.error(error_msg)
                return error_msg
        except Exception as e:
            error_msg = f"Failed to click image: {e}"
            logger.error(error_msg)
            return error_msg
