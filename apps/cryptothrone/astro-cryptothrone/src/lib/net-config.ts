export interface CtNetConfig {
	jwt: string;
	username: string;
	wsUrl: string;
}

let config: CtNetConfig | null = null;

export const REALM_CHAT_GAME = 'cryptothrone';
export const REALM_CHAT_CHANNEL = '#cryptothrone';

export function resolveWsUrl(): string {
	const env = import.meta.env.PUBLIC_CT_GAME_WS as string | undefined;
	return env && env.length > 0 ? env : 'wss://game.cryptothrone.com/ws';
}

export function resolveChatUrl(): string {
	const env = import.meta.env.PUBLIC_CT_CHAT_WS as string | undefined;
	return env && env.length > 0 ? env : 'wss://chat.kbve.com/gamechat';
}

export function setCtNetConfig(next: CtNetConfig): void {
	config = next;
}

export function getCtNetConfig(): CtNetConfig | null {
	return config;
}
