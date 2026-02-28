import asyncio
import logging
import os
import json

logger = logging.getLogger("uvicorn")

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from seleniumbase import SB
    from seleniumbase.common.exceptions import NoSuchElementException, TimeoutException
except ImportError:
    SB = None
    NoSuchElementException = Exception
    TimeoutException = Exception


class ChromeClient:
    def __init__(self, headless=False, display=":1"):
        self.headless = headless
        self.display = display
        self.sb = None

    def set_display(self):
        os.environ["DISPLAY"] = self.display
        logger.info(f"Using display {self.display}")

    def click_turnstile_and_verify(self):
        self.sb.switch_to_frame("iframe")
        self.sb.driver.uc_click("span")
        self.sb.assert_element("img#captcha-success", timeout=3)

    def open_the_turnstile_page(self, url):
        self.sb.driver.uc_open_with_reconnect(url, reconnect_time=2)

    def parse_job_board_html(self, job_board_html):
        if BeautifulSoup is None:
            raise ImportError("beautifulsoup4 is required. Install with: pip install fudster")
        soup = BeautifulSoup(job_board_html, "html.parser")
        job_data = []

        for section in soup.find_all("section", class_="level-0"):
            department_name = section.find("h3").get_text(strip=True) if section.find("h3") else "Unknown Department"

            for job_listing in section.find_all("div", class_="opening"):
                job_title = job_listing.find("a").get_text(strip=True) if job_listing.find("a") else "No Title"
                job_link = job_listing.find("a")["href"] if job_listing.find("a") else ""
                loc_span = job_listing.find("span", class_="location")
                location = loc_span.get_text(strip=True) if loc_span else "No Location"

                job_data.append({
                    "department": department_name,
                    "title": job_title,
                    "location": location,
                    "link": job_link
                })

        return json.dumps(job_data)

    async def start_chrome_async(self):
        if SB is None:
            raise ImportError("seleniumbase is required. Install with: pip install fudster[browser]")
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
            self.sb.__exit__(None, None, None)
            logger.info("Chromedriver stopped successfully.")
            return "Chromedriver stopped successfully."
        except Exception as e:
            logger.error(f"Failed to stop Chromedriver: {e}")
            return f"Failed to stop Chromedriver: {e}"

    async def perform_task_with_chrome(self, task_url):
        self.set_display()

        start_message = await self.start_chrome_async()
        logger.info(start_message)

        try:
            await asyncio.to_thread(self.sb.open, task_url)
            logger.info(f"Task completed successfully: navigated to {task_url}")
        except Exception as e:
            logger.error(f"Failed to perform task: {e}")
            await self.stop_chrome_async()
            return f"Failed to perform task: {e}"

        stop_message = await self.stop_chrome_async()
        logger.info(stop_message)

        return "Chromedriver task completed and stopped successfully."

    async def go_to_gitlab(self):
        if SB is None:
            raise ImportError("seleniumbase is required. Install with: pip install fudster[browser]")
        self.set_display()

        try:
            with SB(uc=True, headless=self.headless, browser="chrome", headed=True) as sb:
                self.sb = sb
                url = "https://gitlab.com/users/sign_in"
                for attempt in range(3):
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
                        if attempt == 2:
                            raise
        except Exception as e:
            logger.error(f"Failed to navigate to GitLab sign-in page: {e}")
            return f"Failed to navigate to GitLab sign-in page: {e}"
        finally:
            await self.stop_chrome_async()

    async def close(self):
        pass

    async def fetch_embedded_job_board(self):
        if SB is None:
            raise ImportError("seleniumbase is required. Install with: pip install fudster[browser]")
        url = "https://boards.greenhouse.io/embed/job_board?for=weedmaps77&b=https%3A%2F%2Fweedmaps.com%2Fcareers"
        self.set_display()

        try:
            with SB(uc=True, headless=self.headless, browser="chrome", headed=True) as sb:
                self.sb = sb
                self.sb.open(url)
                logger.info(f"Navigated to {url}")

                self.sb.wait_for_element_visible("#embedded_job_board_wrapper", timeout=10)

                job_board_html = self.sb.get_attribute("#embedded_job_board_wrapper", "outerHTML")
                job_board_json = self.parse_job_board_html(job_board_html)
                if isinstance(job_board_json, str):
                    job_board_json = json.loads(job_board_json)
                logger.info("Successfully retrieved embedded job board content.")

                return job_board_json
        except Exception as e:
            logger.error(f"Failed to fetch embedded job board: {e}")
            return f"Failed to fetch embedded job board: {e}"
