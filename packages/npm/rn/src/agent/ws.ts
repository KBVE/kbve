import type {
	AgentServerEvent,
	CoreEffect,
	CoreEvent,
	EffectExecutor,
} from '@kbve/core';

export function createWebSocketExecutor(): EffectExecutor<
	CoreEffect,
	CoreEvent
> {
	let socket: WebSocket | null = null;
	return {
		execute(effect, dispatch) {
			switch (effect.type) {
				case 'ws.connect': {
					const ws = new WebSocket(effect.config.url, [
						'bearer',
						effect.config.token,
					]);
					socket = ws;
					ws.onopen = () => dispatch({ type: 'connected' });
					ws.onclose = () => dispatch({ type: 'disconnected' });
					ws.onerror = () =>
						dispatch({
							type: 'connect_error',
							message: 'websocket error',
						});
					ws.onmessage = (event: MessageEvent) => {
						try {
							const data =
								typeof event.data === 'string'
									? event.data
									: '';
							dispatch({
								type: 'inbound',
								event: JSON.parse(data) as AgentServerEvent,
							});
						} catch {
							dispatch({
								type: 'connect_error',
								message: 'malformed message',
							});
						}
					};
					break;
				}
				case 'ws.send':
					if (socket && socket.readyState === WebSocket.OPEN) {
						socket.send(JSON.stringify(effect.command));
					}
					break;
				case 'ws.close':
					socket?.close();
					socket = null;
					break;
			}
		},
	};
}
