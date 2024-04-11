from fastapi import FastAPI, WebSocket
from broadcaster import Broadcast
import anyio
import uvicorn

from contextlib import asynccontextmanager


from kbve_atlas.api.clients import CoinDeskClient, WebsocketEchoClient, PoetryDBClient
from kbve_atlas.api.utils import RSSUtility, KRDecorator, CORSUtil


broadcast = Broadcast("memory://")

@asynccontextmanager
async def lifespan(app: FastAPI):
    await broadcast.connect()
    yield
    await broadcast.disconnect()


app = FastAPI(lifespan=lifespan)
kr_decorator = KRDecorator(app)

custom_origins = [
    "http://n8n",
    "https://n8n",
    "https://atlas",
    "http://atlas"
]
CORSUtil(app, origins=custom_origins)


@app.websocket("/")
async def chatroom_ws(websocket: WebSocket):
    await websocket.accept()

    async with anyio.create_task_group() as task_group:
        async def run_chatroom_ws_receiver() -> None:
            async for message in websocket.iter_text():
                await broadcast.publish(channel="chatroom", message=message)
            task_group.cancel_scope.cancel()

        async def run_chatroom_ws_sender() -> None:
            async with broadcast.subscribe(channel="chatroom") as subscriber:
                async for event in subscriber:
                    await websocket.send_text(event.message)

        task_group.start_soon(run_chatroom_ws_receiver)
        task_group.start_soon(run_chatroom_ws_sender)


@app.get("/")
async def root():
    websocket_client = WebsocketEchoClient()
    try:
        await websocket_client.example()
    finally:
        await websocket_client.close()
        return {"ws": "true"}

@app.get("/echo")
async def echo_main():
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8086)