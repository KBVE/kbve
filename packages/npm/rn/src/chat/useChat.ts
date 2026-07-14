import { useSyncExternalStore } from 'react';
import type { ChatViewModel } from '@kbve/core';
import { useKbve } from '../auth/KbveProvider';
import { KBVE_CHAT_GAME } from '../config';

export function useChat(): ChatViewModel {
	const { chatStore } = useKbve();
	return useSyncExternalStore(
		chatStore.subscribe,
		chatStore.getSnapshot,
		chatStore.getSnapshot,
	);
}

export interface ChatActions {
	connect: (nick: string, game?: string, channel?: string) => void;
	send: (content: string) => void;
	close: () => void;
}

export function useChatActions(): ChatActions {
	const { chatStore } = useKbve();
	return {
		connect: (nick, game = KBVE_CHAT_GAME, channel = '#general') =>
			chatStore.dispatch({
				type: 'connect',
				config: { game, channel, platform: 'mobile', nick },
			}),
		send: (content) => chatStore.dispatch({ type: 'send', content }),
		close: () => chatStore.dispatch({ type: 'close' }),
	};
}
