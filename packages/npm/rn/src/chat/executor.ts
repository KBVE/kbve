import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ChatEffect,
	ChatEvent,
	ChatMessage,
	EffectExecutor,
} from '@kbve/core';

export function createChatExecutor(
	client: SupabaseClient,
	baseUrl: string,
): EffectExecutor<ChatEffect, ChatEvent> {
	let socket: WebSocket | null = null;
	return {
		execute(effect, dispatch) {
			switch (effect.type) {
				case 'chat.connect':
					void client.auth.getSession().then(({ data }) => {
						const token = data.session?.access_token;
						if (!token) {
							dispatch({
								type: 'connect_error',
								message: 'Not signed in',
							});
							return;
						}
						const url = `${baseUrl}/gamechat?game=${encodeURIComponent(effect.config.game)}&token=${encodeURIComponent(token)}`;
						const ws = new WebSocket(url);
						socket = ws;
						ws.onopen = () => dispatch({ type: 'connected' });
						ws.onclose = () => dispatch({ type: 'disconnected' });
						ws.onerror = () =>
							dispatch({
								type: 'connect_error',
								message: 'chat connection failed',
							});
						ws.onmessage = (event: MessageEvent) => {
							try {
								const data =
									typeof event.data === 'string'
										? event.data
										: '';
								dispatch({
									type: 'inbound',
									message: JSON.parse(data) as ChatMessage,
								});
							} catch {
								/* ignore non-JSON frames */
							}
						};
					});
					break;
				case 'chat.send':
					if (socket && socket.readyState === WebSocket.OPEN) {
						socket.send(JSON.stringify(effect.message));
					}
					break;
				case 'chat.close':
					socket?.close();
					socket = null;
					break;
			}
		},
	};
}
