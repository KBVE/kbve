// Auth adapter — maps the shared @kbve/rn Supabase auth into the shape our
// marketplace screens expect. The real session is provided by <KbveProvider>
// in main.tsx and gated by <AuthGate>, so inside the app `user` is non-null.
//
// Capabilities (poster / taker) will eventually come from the `auth.users.role`
// Capability bitmask exposed by the API. Until that endpoint exists, a signed-in
// member gets both — gating UI still works, it just isn't restricted yet.

import { useAuth as useKbveAuth, useAuthActions } from '@kbve/rn/auth';

export interface CurrentUser {
	id: string;
	handle: string;
	display_name: string;
	avatar_url: string;
	can_take: boolean;
	can_post: boolean;
}

export interface SessionState {
	user: CurrentUser | null;
	signOut: () => void;
}

export function useAuth(): SessionState {
	const auth = useKbveAuth();
	const { signOut } = useAuthActions();

	const name = auth.username ?? auth.user?.username ?? null;
	const user: CurrentUser | null =
		auth.signedIn && auth.user
			? {
					id: auth.user.id,
					handle: name ?? auth.user.email ?? auth.user.id,
					display_name: name ?? auth.user.email ?? 'Member',
					avatar_url: `https://i.pravatar.cc/128?u=${auth.user.id}`,
					// TODO: derive from auth.users.role (Capability bitmask) once exposed.
					can_take: true,
					can_post: true,
				}
			: null;

	return { user, signOut };
}
