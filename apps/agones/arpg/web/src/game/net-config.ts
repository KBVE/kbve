import { createNetConfig, type GameNetConfig } from '@kbve/laser';
import { resolveWsUrl } from './config';
import { authBridge } from '../lib/auth';

// Re-export laser's config type under the arpg-local name the game uses.
export type NetConfig = GameNetConfig;

// The shared net-config store, wired to the arpg WS resolver + the web Supabase
// session source (lib/auth). buildNetConfig resolves null with no session, so
// ReactIsoArpgApp shows the sign-in gate (the server denies an empty JWT).
const store = createNetConfig({ source: authBridge, resolveWsUrl });

export function setNetConfig(cfg: NetConfig): void {
	store.set(cfg);
}

export function getNetConfig(): NetConfig | null {
	return store.get();
}

export function clearNetConfig(): void {
	store.clear();
}

export function buildNetConfig(): Promise<NetConfig | null> {
	return store.build();
}
