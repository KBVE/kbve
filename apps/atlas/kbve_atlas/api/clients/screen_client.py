import pyautogui
import cv2
import numpy as np
import logging
import os
import random
import math
from humancursor import SystemCursor
from ...api.utils import ImageUtility

logger = logging.getLogger("uvicorn")

class ScreenClient:
    def __init__(self, image_url=None, timeout=5):
        self.image_url = image_url
        self.image_util = ImageUtility(timeout=timeout)

    def get_vnc_display_size(self):
        screen_size = pyautogui.size()
        return screen_size

    async def find_and_click_image(self, button='left'):
        os.environ['DISPLAY'] = ':1'

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
                # Calculate the center of the found template
                center_x = max_loc[0] + template.shape[1] // 2
                center_y = max_loc[1] + template.shape[0] // 2

                # Define the maximum radius for random offset
                radius = 10

                # Generate random offset within the circle
                angle = random.uniform(0, 2 * math.pi)
                r = radius * math.sqrt(random.uniform(0, 1))
                random_offset_x = int(r * math.cos(angle))
                random_offset_y = int(r * math.sin(angle))

                # Calculate the final click coordinates with the random offset
                click_x = center_x + random_offset_x
                click_y = center_y + random_offset_y

                cursor = SystemCursor()
                cursor.click_on([click_x, click_y])  # or use 
                #pyautogui.click(click_x, click_y)

                # Add a small delay before clicking to ensure the application is focused
                #pyautogui.sleep(0.5)
                #pyautogui.click(click_x, click_y, button=button)
                # Add a small delay after clicking to ensure the click is registered
                #pyautogui.sleep(0.5)


                logger.info(f"Clicked at position: ({click_x}, {click_y}) with offset ({random_offset_x}, {random_offset_y})")
                return "Click successful"
            else:
                error_msg = "Image not found with sufficient confidence."
                logger.error(error_msg)
                return error_msg
        except Exception as e:
            error_msg = f"Failed to click image: {e}"
            logger.error(error_msg)
            return error_msg


    def debug_mouse_move_and_click(self, coordinates, button='left', move_duration=1.0):
        os.environ['DISPLAY'] = ':1'  # Ensure the DISPLAY environment variable is set

        try:
            screen_width, screen_height = self.get_vnc_display_size()
            logger.info(f"VNC Display size: width={screen_width}, height={screen_height}")

            for coord in coordinates:
                x, y = coord

                # Ensure the coordinates are within the screen bounds
                x = min(max(x, 0), screen_width - 1)
                y = min(max(y, 0), screen_height - 1)

                logger.info(f"Moving to: ({x}, {y}) and clicking with {button} button")

                # Add a small delay before moving to ensure visibility
                pyautogui.sleep(0.5)
                pyautogui.moveTo(x, y, duration=move_duration)
                pyautogui.sleep(0.5)
                pyautogui.click(x, y, button=button)
                pyautogui.sleep(0.5)  # Add a small delay after clicking to ensure the click is registered

            return "Mouse move and click test completed successfully."
        except Exception as e:
            error_msg = f"Failed during mouse move and click test: {e}"
            logger.error(error_msg)
            return error_msg