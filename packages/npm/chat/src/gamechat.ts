export interface GamechatFrame {
	kind: string;
	sender: string;
	platform: string;
	channel: string;
	content: string;
	payload?: Record<string, unknown>;
}

export const GAMECHAT_KIND_CHAT = 'chat';
