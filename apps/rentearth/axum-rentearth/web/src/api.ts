export type ClientVersion = {
	platform: string;
	upload_id: number;
	channel: string | null;
	user_version: string | null;
	build_id: number | null;
	state: string | null;
	live: boolean;
	updated_at: string | null;
};

export async function fetchClients(): Promise<ClientVersion[]> {
	const res = await fetch('/api/downloads', {
		headers: { accept: 'application/json' },
	});
	if (!res.ok) throw new Error(`downloads ${res.status}`);
	return res.json();
}

export const PLATFORMS = [
	{ slug: 'windows', name: 'Windows' },
	{ slug: 'macos', name: 'macOS' },
	{ slug: 'linux', name: 'Linux' },
] as const;
