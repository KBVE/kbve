let socket = null;
const listeners = new Set();
const reconnectInterval = 3000;

function getWebSocketURL(path = '/ws') {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}${path}`;
}

export function connectWebSocket(path = '/ws') {
    if (socket && socket.readyState <= 1) return socket;

    socket = new WebSocket(getWebSocketURL(path));

    socket.addEventListener('open', () => {
        console.log('[WebSocket] Connected');
    });

    socket.addEventListener('message', (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            console.warn('[WebSocket] Non-JSON message:', event.data);
            return;
        }
        for (const listener of listeners) {
            listener(message);
        }
    });

    socket.addEventListener('close', () => {
        console.warn('[WebSocket] Disconnected – retrying...');
        setTimeout(() => connectWebSocket(path), reconnectInterval);
    });

    socket.addEventListener('error', (e) => {
        console.error('[WebSocket] Error:', e);
    });

    return socket;
}

export function addWebSocketListener(callback) {
    listeners.add(callback);
}

export function removeWebSocketListener(callback) {
    listeners.delete(callback);
}

export function sendWebSocketMessage(data) {
    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}
