from typing import List
from bs4 import BeautifulSoup
from ..api_connector import APIConnector

from ...models.rss import RssFeed, RssItem


class RSSUtility:
    def __init__(self, base_url: str):
        """
        Initializes the RSSUtility class with a base URL for the RSS feed.

        :param base_url: The base URL of the RSS feed.
        """
        self.base_url = base_url
        self.connector = APIConnector(base_url=base_url)

    async def fetch_raw_rss(self) -> bytes:
        """
        Fetches raw RSS feed data.

        :return: Raw RSS feed data as bytes.
        """
        raw_xml = await self.connector.get_raw_content("")
        await self.connector.close()
        return raw_xml

    async def parse_rss(self, raw_xml: bytes) -> BeautifulSoup:
        """
        Parses raw RSS feed data into a BeautifulSoup object.

        :param raw_xml: Raw RSS feed data as bytes.
        :return: Parsed RSS feed as a BeautifulSoup object.
        """
        soup = BeautifulSoup(raw_xml, 'xml')
        return soup

    async def fetch_and_parse_rss(self) -> BeautifulSoup:
        """
        Fetches and parses the RSS feed, returning a BeautifulSoup object.

        :return: Parsed RSS feed as a BeautifulSoup object.
        """
        raw_xml = await self.fetch_raw_rss()
        soup = await self.parse_rss(raw_xml)
        return soup

    async def convert_to_model(self, soup: BeautifulSoup) -> RssFeed:
        """
        Converts a BeautifulSoup object representing an RSS feed into an RssFeed model.
        """
        channel = soup.find('channel')
        feed_title = channel.find(
            'title').text if channel.find('title') else None
        feed_link = channel.find('link').text if channel.find('link') else None
        feed_description = channel.find(
            'description').text if channel.find('description') else None

        items: List[RssItem] = []
        for item in channel.find_all('item'):
            items.append(RssItem(
                title=item.find('title').text if item.find('title') else None,
                link=item.find('link').text if item.find('link') else None,
                description=item.find('description').text if item.find(
                    'description') else None,
                pubDate=item.find('pubDate').text if item.find(
                    'pubDate') else None
            ))

        return RssFeed(title=feed_title, link=feed_link, description=feed_description, items=items)

    @staticmethod
    def format_rss_feed(rss_feed: RssFeed) -> str:
        """
        Formats the RSS feed for display.
        """
        formatted_feed = f"RSS Feed: {rss_feed.title}\n"
        for item in rss_feed.items:
            formatted_feed += (
                f"\nTitle: {item.title}\n"
                f"Link: {item.link}\n"
                f"Description: {item.description}\n"
                f"PubDate: {item.pubDate}\n"
            )
            formatted_feed += "-" * 50 + "\n"  # Separator between items
        return formatted_feed