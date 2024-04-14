import logging
from aiohttp import ClientSession
from fastapi import Request
from starlette.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware


logger = logging.getLogger("uvicorn")

class NoVNCProxy(BaseHTTPMiddleware):
    def __init__(self, app, proxy_url="http://localhost:6080"):
        super().__init__(app)
        self.proxy_url = proxy_url.rstrip('/') 
        self.session = ClientSession()
        logger.info(f"NoVNCProxy initialized with proxy URL: {self.proxy_url}")

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/novnc"):
            adjusted_path = request.url.path[len("/novnc"):] 
            if not adjusted_path.startswith('/'):
                adjusted_path = '/' + adjusted_path 
            if adjusted_path == '/':
                adjusted_path = '/vnc.html'

            proxy_url = f"{self.proxy_url}{adjusted_path}"
            logger.debug(f"Proxying request: {request.url.path} to {proxy_url}")

            async with self.session.request(
                request.method, proxy_url, allow_redirects=True,
                headers={key: value for key, value in request.headers.items() if key != 'host'},
                data=await request.body()) as resp:

                content = await resp.read()
                headers = {key: value for key, value in resp.headers.items() if key.lower() != 'content-encoding'}
                logger.debug(f"Response status from {proxy_url}: {resp.status}")
                if resp.status != 200:
                    logger.error(f"Error from proxy {proxy_url}: {await resp.text()}")

                return Response(content=content, status_code=resp.status, headers=headers)
        else:
            response = await call_next(request)
            return response

    async def close(self):
        await self.session.close()
        logger.info("Closed NoVNCProxy HTTP session")
