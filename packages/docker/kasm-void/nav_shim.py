#!/usr/bin/env python3
import hmac
import ipaddress
import json
import logging
import os
import re
import sys
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

try:
    import websocket
except ImportError:
    sys.stderr.write('[nav-shim] websocket-client not installed; exiting\n')
    sys.exit(1)

PORT = int(os.environ.get('NAV_SHIM_PORT', '9998'))
CDP_HOST = '127.0.0.1'
CDP_PORT = int(os.environ.get('CDP_PORT', '9222'))
MAX_BODY = 4096
MAX_URL = 2048
ALLOWED_SCHEMES = {'http', 'https'}
CDP_TIMEOUT = 5

logging.basicConfig(
    level=logging.INFO,
    format='[nav-shim] %(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
log = logging.getLogger('nav-shim')


def current_token() -> str:
    return os.environ.get('URL_LAUNCHER_TOKEN') or os.environ.get('VNC_PW') or ''


def url_safe(raw: str) -> bool:
    if not isinstance(raw, str) or not raw or len(raw) > MAX_URL:
        return False
    try:
        p = urlparse(raw)
    except ValueError:
        return False
    if p.scheme.lower() not in ALLOWED_SCHEMES:
        return False
    if p.username or p.password:
        return False
    host = (p.hostname or '').lower()
    if not host:
        return False
    if host in {'localhost', 'broadcasthost'}:
        return False
    try:
        ip = ipaddress.ip_address(host)
        if (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    except ValueError:
        if not re.match(r'^[a-z0-9.-]+$', host):
            return False
    return True


def cdp_targets():
    req = urllib.request.Request(
        f'http://{CDP_HOST}:{CDP_PORT}/json/list',
        method='GET',
    )
    with urllib.request.urlopen(req, timeout=CDP_TIMEOUT) as resp:
        return json.loads(resp.read())


def cdp_navigate(url: str) -> tuple[bool, str]:
    targets = cdp_targets()
    page = next(
        (t for t in targets if t.get('type') ==
         'page' and t.get('webSocketDebuggerUrl')),
        None,
    )
    if not page:
        return False, 'no page target available'

    ws = websocket.create_connection(
        page['webSocketDebuggerUrl'],
        timeout=CDP_TIMEOUT,
        origin='http://127.0.0.1',
    )
    try:
        ws.send(
            json.dumps(
                {
                    'id': int(time.time() * 1000) & 0x7FFFFFFF,
                    'method': 'Page.navigate',
                    'params': {'url': url},
                }
            )
        )
        reply = json.loads(ws.recv())
    finally:
        ws.close()

    if 'error' in reply:
        return False, str(reply['error'].get('message', 'CDP error'))
    return True, reply.get('result', {}).get('frameId', '')


def auth_ok(header_value: str) -> bool:
    token = current_token()
    if not token or not header_value:
        return False
    if not header_value.lower().startswith('bearer '):
        return False
    presented = header_value.split(' ', 1)[1].strip()
    return hmac.compare_digest(presented.encode(), token.encode())


class NavHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        log.info('%s - %s', self.client_address[0], fmt % args)

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path == '/healthz':
            self._send_json(200, {'ok': True})
            return
        self._send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/open':
            self._send_json(404, {'error': 'not found'})
            return
        if not auth_ok(self.headers.get('Authorization', '')):
            self._send_json(401, {'error': 'unauthorized'})
            return

        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > MAX_BODY:
            self._send_json(400, {'error': 'invalid body length'})
            return
        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw)
        except (ValueError, OSError):
            self._send_json(400, {'error': 'invalid json'})
            return

        url = payload.get('url') if isinstance(payload, dict) else None
        if not url_safe(url):
            self._send_json(400, {'error': 'url rejected by policy'})
            return

        try:
            ok, detail = cdp_navigate(url)
        except urllib.error.URLError as e:
            log.warning('CDP unreachable: %s', e)
            self._send_json(503, {'error': 'cdp unreachable'})
            return
        except Exception as e:
            log.exception('CDP failure')
            self._send_json(
                502, {'error': f'cdp failure: {e.__class__.__name__}'})
            return

        if not ok:
            self._send_json(502, {'error': detail or 'navigation failed'})
            return
        self._send_json(200, {'ok': True, 'frameId': detail})


def main():
    if not current_token():
        log.warning(
            'starting with empty URL_LAUNCHER_TOKEN; every request will 401')
    httpd = ThreadingHTTPServer(('0.0.0.0', PORT), NavHandler)
    log.info('listening on 0.0.0.0:%d, CDP at 127.0.0.1:%d', PORT, CDP_PORT)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
