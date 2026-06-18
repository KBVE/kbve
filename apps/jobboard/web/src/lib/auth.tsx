// Auth adapter — maps the shared @kbve/rn Supabase session into the shape our
// marketplace screens expect, and resolves real capabilities from the API.
//
// Capability = profile existence (see backend /auth/me): a `talent_profiles`
// row → taker, a `client_profiles` row → poster. We fetch /auth/me (bearer
// attached by <AuthBridge/>) so gating reflects approved capabilities, not a
// default. `hasCapability` is false for a signed-in member who hasn't been
// vetted yet — used to nudge them to /apply.

import { useQuery } from '@tanstack/react-query';
import { useAuth as useKbveAuth, useAuthActions } from '@kbve/rn/auth';
import { fetchAuthMe } from '../api/client';

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
	/** Signed in (valid session), regardless of vetting/capabilities. */
	signedIn: boolean;
	/** Approved as taker or poster. */
	hasCapability: boolean;
	/** Still resolving the session or /auth/me. */
	loading: boolean;
	signOut: () => void;
}

export function useAuth(): SessionState {
	const auth = useKbveAuth();
	const { signOut } = useAuthActions();

	const signedIn = auth.signedIn && !!auth.user;

	const { data: me, isLoading: meLoading } = useQuery({
		queryKey: ['auth-me'],
		queryFn: fetchAuthMe,
		enabled: signedIn,
		staleTime: 30_000,
	});

	const name = auth.username ?? auth.user?.username ?? me?.username ?? null;
	const user: CurrentUser | null =
		signedIn && auth.user
			? {
					id: auth.user.id,
					handle: name ?? auth.user.email ?? auth.user.id,
					display_name: name ?? auth.user.email ?? 'Member',
					avatar_url: `https://i.pravatar.cc/128?u=${auth.user.id}`,
					can_take: me?.talent_profile ?? false,
					can_post: me?.client_profile ?? false,
				}
			: null;

	return {
		user,
		signedIn,
		hasCapability: !!(user?.can_take || user?.can_post),
		loading: auth.loading || (signedIn && meLoading),
		signOut,
	};
}
