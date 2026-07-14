import type { AuthSession } from '@kbve/core';

export function readDroidSession(): AuthSession | null {
	return null;
}

export async function readDroidSessionFromIdb(): Promise<AuthSession | null> {
	return null;
}

export function subscribeDroidSession(
	_cb: (session: AuthSession | null) => void,
): () => void {
	return () => undefined;
}

export interface DroidSignOutConfig {
	supabaseUrl: string;
	anonKey: string;
}

export async function droidSignOut(_config: DroidSignOutConfig): Promise<void> {
	return undefined;
}
