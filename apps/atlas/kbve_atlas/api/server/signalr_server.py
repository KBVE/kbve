from aiohttp import web
from signalrcore.hub.base_hub import Hub
from typing import Optional

class SignalRServer:
    def __init__(self, hub_name: str = "rsps", port: int = 5000):
        self.hub_name = hub_name
        self.port = port
        self.aio_app = self.create_signalr_app()  # Initialize the aiohttp app

    def create_signalr_app(self) -> web.Application:
        """Sets up the aiohttp application with SignalR Hub routes."""
        aio_app = web.Application()
        hub = SignalRHub()  # Instance of your custom Hub
        aio_app.router.add_get(f"/{self.hub_name}/negotiate", hub.handle_negotiate)
        aio_app.router.add_get(f"/{self.hub_name}", hub.handle_connect)
        aio_app.router.add_post(f"/{self.hub_name}", hub.handle_invoke)
        return aio_app

    async def start(self):
        """Starts the aiohttp app on the specified port."""
        runner = web.AppRunner(self.aio_app)
        await runner.setup()
        site = web.TCPSite(runner, host="0.0.0.0", port=self.port)
        await site.start()
        print(f"SignalR server running on port {self.port}")

class SignalRHub(Hub):
    def __init__(self):
        super().__init__()

    async def on_connect(self, connection_id):
        print(f"Client connected: {connection_id}")

    async def on_disconnect(self, connection_id):
        print(f"Client disconnected: {connection_id}")

    async def receive_message(self, message):
        print(f"Received message: {message}")
        await self.send("ReceiveMessage", [message])  # Broadcast to all clients
