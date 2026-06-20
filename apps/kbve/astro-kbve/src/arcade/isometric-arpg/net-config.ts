import { resolveWsUrl } from './config';

export interface NetConfig {
	wsUrl: string;
	jwt: string;
	username: string;
}

let current: NetConfig | null = null;

export function setNetConfig(cfg: NetConfig): void {
	current = cfg;
}

export function getNetConfig(): NetConfig | null {
	return current;
}

export function clearNetConfig(): void {
	current = null;
}

function usernameFromToken(token: string): string {
	try {
		const payload = token.split('.')[1];
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const claims = JSON.parse(json) as { kbve_username?: string };
		return claims.kbve_username ?? '';
	} catch {
		return '';
	}
}

export async function buildNetConfig(): Promise<NetConfig | null> {
	const { authBridge } = await import('../../components/auth/AuthBridge');
	const session = await authBridge.getSession();
	const jwt = session?.access_token ?? '';
	if (!jwt) return null;
	const username = usernameFromToken(jwt);
	const cfg: NetConfig = { wsUrl: resolveWsUrl(), jwt, username };
	setNetConfig(cfg);
	return cfg;
}
