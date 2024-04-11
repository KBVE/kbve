from broadcaster import Broadcast
from fastapi import WebSocket
import anyio

# TODO : broadcast = ENV_REDIS_FILE For k8s/swarm.
import logging

# Use the 'uvicorn' named logger to align with Uvicorn's default logging settings
logger = logging.getLogger("uvicorn")

class BroadcastUtility:
    common_uris = ["redis://localhost:6379", "redis://redis:6379"]

    def __init__(self, uris=None, connection_timeout=5):
        self.uris = uris if uris is not None else []
        self.broadcast = None
        self.connected = False
        self.connection_timeout = connection_timeout

    async def connect(self):
        all_uris = self.common_uris + self.uris
        for uri in all_uris:
            try:
                async with anyio.fail_after(self.connection_timeout):
                    self.broadcast = Broadcast(uri)
                    await self.broadcast.connect()
                    self.connected = True
                    logger.info(f"Connected to {uri}")
                    return
            except TimeoutError as e:
                logger.warning(f"Connection to {uri} timed out: {e}")
            except Exception as e:
                logger.warning(f"Failed to connect to optional {uri}: {e}")

        if not self.connected:
            logger.info("Falling back to memory://")
            self.broadcast = Broadcast("memory://")
            await self.broadcast.connect()
            self.connected = True

    async def disconnect(self):
        if self.connected and self.broadcast:
            await self.broadcast.disconnect()
            self.connected = False
            logger.info("Disconnected.")


    async def send_messages(self, websocket: WebSocket, channel: str):
        async with anyio.create_task_group() as task_group:
            async def receiver():
                async for message in websocket.iter_text():
                    await self.broadcast.publish(channel=channel, message=message)
                task_group.cancel_scope.cancel()

            async def sender():
                async with self.broadcast.subscribe(channel=channel) as subscriber:
                    async for event in subscriber:
                        await websocket.send_text(event.message)

            task_group.start_soon(receiver)
            task_group.start_soon(sender)