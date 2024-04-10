import asyncio
from kbve_atlas.api.clients.poetry_db_client import PoetryDBClient
from kbve_atlas.api.clients.websocket_echo_client import WebsocketEchoClient
from kbve_atlas.api.clients.coindesk_client import CoinDeskClient
from kbve_atlas.api.rss.rss_utils import RSSUtility


async def poetry_main():
    poetry_client = PoetryDBClient()
    try:
        random_poem = await poetry_client.get_random_poem()
        print(f"Title: {random_poem.title}\nAuthor: {random_poem.author}\n")
        print("\n".join(random_poem.lines))
        await poetry_client.close()
        print("\n Closed Session")
    except Exception as e:
        print(f"An error occurred: {e}")

        pass


async def wss_main():
    websocket_client = WebsocketEchoClient()
    try:
        await websocket_client.example()
    finally:
        await websocket_client.close()

        pass


async def coindesk_main():
    coindesk_client = CoinDeskClient()
    try:
        bitcoin_price = await coindesk_client.get_current_bitcoin_price()
        print(bitcoin_price)
    finally:
        await coindesk_client.close()

        pass


async def google_main():
    #rss_url = "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en"
    rss_url = "https://feeds.bbci.co.uk/news/world/rss.xml"
    rss_utility = RSSUtility(base_url=rss_url)

    try:

        soup = await rss_utility.fetch_and_parse_rss()
        rss_feed_model = await rss_utility.convert_to_model(soup)
        formatted_feed = RSSUtility.format_rss_feed(rss_feed_model)
        print(formatted_feed)
    finally:
        print("Done RSS")

    pass


async def main():
    # Using asyncio.gather to run both tasks concurrently
    await asyncio.gather(
        # poetry_main(),
        # wss_main(),
        google_main(),
        coindesk_main(),
    )

if __name__ == "__main__":
    asyncio.run(main())
