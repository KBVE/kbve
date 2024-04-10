from fastapi import FastAPI
from kbve_atlas.api.clients import CoinDeskClient, WebsocketEchoClient, PoetryDBClient
from kbve_atlas.api.utils import RSSUtility, KRDecorator

app = FastAPI()
kr_decorator = KRDecorator(app)

@app.get("/")
async def root():
    websocket_client = WebsocketEchoClient()
    try:
        await websocket_client.example()
    finally:
        await websocket_client.close()
        return {"ws": "true"}

@app.get("/news")
async def google_news():
    rss_utility = RSSUtility(base_url="https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en")
    try:
        soup = await rss_utility.fetch_and_parse_rss()
        rss_feed_model = await rss_utility.convert_to_model(soup)
        formatted_feed = RSSUtility.format_rss_feed(rss_feed_model)
        return {"news": formatted_feed}
    except:
        return {"news": "failed"}

@kr_decorator.k_r("/bitcoin-price", CoinDeskClient, "get_current_bitcoin_price")
def bitcoin_price(price):
    return {"bitcoin_price": price}

@kr_decorator.k_r("/poem", PoetryDBClient, "get_random_poem")
def poetry_db(poem):
    return {"poem": poem}