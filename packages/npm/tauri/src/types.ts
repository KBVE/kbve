export type Provider = 'github' | 'discord';

export type SupabaseUser = {
	id: string;
	email: string | null;
	role: string;
	aud: string | null;
	user_metadata: Record<string, unknown>;
	app_metadata: Record<string, unknown>;
	created_at: string | null;
	updated_at: string | null;
};

export type Session = {
	access_token: string;
	refresh_token: string;
	token_type: string;
	expires_in: number;
	expires_at: number | null;
	user: SupabaseUser;
};

export type AuthUser = {
	id: string;
	email?: string;
	name?: string;
	avatar_url?: string;
};

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

export type Installed = {
	platform: string;
	build_id: number | null;
	user_version: string | null;
	entrypoint: string | null;
	install_dir: string;
};

export type Progress = { received: number; total: number };

export function toAuthUser(session: Session): AuthUser {
	const m = session.user.user_metadata ?? {};
	const pick = (k: string): string | undefined => {
		const v = m[k];
		return typeof v === 'string' ? v : undefined;
	};
	return {
		id: session.user.id,
		email: session.user.email ?? undefined,
		name:
			pick('user_name') ??
			pick('full_name') ??
			pick('name') ??
			session.user.email ??
			undefined,
		avatar_url: pick('avatar_url') ?? pick('picture'),
	};
}
