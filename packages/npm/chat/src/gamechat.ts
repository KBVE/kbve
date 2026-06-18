export interface GamechatFrame {
	kind: string;
	sender: string;
	platform: string;
	channel: string;
	content: string;
	payload?: unknown;
}

export const GAMECHAT_KIND_CHAT = 'chat';
