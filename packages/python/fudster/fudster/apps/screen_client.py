import logging
import os
import random
import math
import tempfile

from ..api.utils import ImageUtility

logger = logging.getLogger("uvicorn")

try:
    import pyautogui
    import cv2
    import numpy as np
    from humancursor import SystemCursor
except ImportError:
    pyautogui = None
    cv2 = None
    np = None
    SystemCursor = None


class ScreenClient:
    def __init__(self, image_url=None, timeout=5):
        self.image_url = image_url
        self.image_util = ImageUtility(timeout=timeout)

    def get_vnc_display_size(self):
        if pyautogui is None:
            raise ImportError("pyautogui is required. Install with: pip install fudster[automation]")
        screen_size = pyautogui.size()
        return screen_size

    async def find_and_click_image(self, button='left'):
        if pyautogui is None or cv2 is None:
            raise ImportError("automation dependencies required. Install with: pip install fudster[automation]")

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

            threshold = 0.8
            if max_val >= threshold:
                center_x = max_loc[0] + template.shape[1] // 2
                center_y = max_loc[1] + template.shape[0] // 2

                radius = 10

                angle = random.uniform(0, 2 * math.pi)
                r = radius * math.sqrt(random.uniform(0, 1))
                random_offset_x = int(r * math.cos(angle))
                random_offset_y = int(r * math.sin(angle))

                click_x = center_x + random_offset_x
                click_y = center_y + random_offset_y

                cursor = SystemCursor()
                cursor.click_on([click_x, click_y])

                logger.info(
                    f"Clicked at position: ({click_x}, {click_y}) "
                    f"with offset ({random_offset_x}, {random_offset_y})"
                )
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
        if pyautogui is None:
            raise ImportError("pyautogui is required. Install with: pip install fudster[automation]")

        os.environ['DISPLAY'] = ':1'

        try:
            screen_width, screen_height = self.get_vnc_display_size()
            logger.info(f"VNC Display size: width={screen_width}, height={screen_height}")

            for coord in coordinates:
                x, y = coord

                x = min(max(x, 0), screen_width - 1)
                y = min(max(y, 0), screen_height - 1)

                logger.info(f"Moving to: ({x}, {y}) and clicking with {button} button")

                pyautogui.sleep(0.5)
                pyautogui.moveTo(x, y, duration=move_duration)
                pyautogui.sleep(0.5)
                pyautogui.click(x, y, button=button)
                pyautogui.sleep(0.5)

            return "Mouse move and click test completed successfully."
        except Exception as e:
            error_msg = f"Failed during mouse move and click test: {e}"
            logger.error(error_msg)
            return error_msg

    def take_screenshot(self):
        if pyautogui is None:
            raise ImportError("pyautogui is required. Install with: pip install fudster[automation]")

        os.environ['DISPLAY'] = ':1'

        try:
            screenshot = pyautogui.screenshot()
            temp_dir = tempfile.mkdtemp()
            screenshot_path = os.path.join(temp_dir, "screenshot.png")
            screenshot.save(screenshot_path)
            logger.info(f"Screenshot saved at: {screenshot_path}")
            return screenshot_path
        except Exception as e:
            error_msg = f"Failed to take screenshot: {e}"
            logger.error(error_msg)
            return None
