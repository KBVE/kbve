import pyautogui
import time
import os
print(os.getenv('DISPLAY'))
def move_mouse_square():
    # Move the mouse to the starting position (top-left corner of the square)
    pyautogui.moveTo(100, 100, duration=1)
    
    # Move the mouse to the top-right corner
    pyautogui.moveTo(500, 100, duration=1)
    
    # Move the mouse to the bottom-right corner
    pyautogui.moveTo(500, 500, duration=1)
    
    # Move the mouse to the bottom-left corner
    pyautogui.moveTo(100, 500, duration=1)
    
    # Move the mouse back to the top-left corner
    pyautogui.moveTo(100, 100, duration=1)

if __name__ == "__main__":
    # Add a short delay before starting to give you time to switch to another window if needed
    time.sleep(5)
    move_mouse_square()
