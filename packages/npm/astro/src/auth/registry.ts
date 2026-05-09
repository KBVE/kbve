import type { SupabaseGateway } from '@kbve/droid';

let _gateway: SupabaseGateway | null = null;

export function registerSupabaseGateway(gateway: SupabaseGateway): void {
	_gateway = gateway;
}

export function getSupabaseGateway(): SupabaseGateway | null {
	return _gateway;
}

export async function getAccessToken(): Promise<string | null> {
	if (!_gateway) return null;
	try {
		const s = await _gateway.getSession();
		const token = (s as { session?: { access_token?: string } } | null)
			?.session?.access_token;
		return token ?? null;
	} catch {
		return null;
	}
}
