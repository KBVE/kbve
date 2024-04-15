import pyautogui
import cv2
import numpy as np
import logging
#from humancursor import SystemCursor
from ...api.utils import ImageUtility

logger = logging.getLogger("uvicorn")


class ScreenClient:
    def __init__(self, image_url, timeout=5):
        self.image_url = image_url
        self.image_util = ImageUtility(timeout=timeout)

    async def find_and_click_image(self):
        try:
            image_path = await self.image_util.download_and_cache_image_async(self.image_url)
            template = cv2.imread(image_path)
            if template is None:
                logger.error(
                    "Failed to load image for path: {}".format(image_path))
                return
            template = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
            screen = pyautogui.screenshot()
            screen = cv2.cvtColor(np.array(screen), cv2.COLOR_RGB2GRAY)

            result = cv2.matchTemplate(screen, template, cv2.TM_CCOEFF_NORMED)
            _, _, _, max_loc = cv2.minMaxLoc(result)

            click_x, click_y = max_loc
            #cursor = SystemCursor()
            #cursor.click_on([click_x, click_y])
            pyautogui.click(click_x, click_y)
            logger.info(f"Clicked at position: ({click_x}, {click_y})")
        except Exception as e:
            logger.error(f"An error occurred: {e}")
