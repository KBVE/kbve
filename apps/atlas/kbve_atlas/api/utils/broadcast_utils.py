from broadcaster import Broadcast
from fastapi import WebSocket
import anyio

# TODO : broadcast = ENV_REDIS_FILE For k8s/swarm.
class BroadcastUtility:
       # Define a class variable with common URIs to try before the user-specified ones
    common_uris = [
        "redis://localhost:6379",
        "redis://redis:6379"
    ]

    def __init__(self, uris=None, connection_timeout=5):
        # If no URIs are provided by the user, use an empty list
        self.uris = uris if uris is not None else []
        self.broadcast = None
        self.connected = False
        self.connection_timeout = connection_timeout  # Timeout in seconds for each connection attempt

    async def connect(self):
        # Combine the common URIs with the user-specified URIs
        all_uris = self.common_uris + self.uris
        
        for uri in all_uris:
            try:
                async with anyio.fail_after(self.connection_timeout):
                    self.broadcast = Broadcast(uri)
                    await self.broadcast.connect()
                    self.connected = True
                    print(f"Connected to {uri}")
                    return  # Exit the method if connection is successful
            except TimeoutError as e:
                print(f"Connection to {uri} timed out: {e}")
            except Exception as e:
                print(f"Failed to connect to {uri}: {e}")

        # If all URIs fail, fall back to memory://
        if not self.connected:
            print("Falling back to memory://")
            self.broadcast = Broadcast("memory://")
            await self.broadcast.connect()
            self.connected = True

    async def disconnect(self):
        if self.connected and self.broadcast:
            await self.broadcast.disconnect()
            self.connected = False


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