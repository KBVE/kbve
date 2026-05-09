import { useStore } from '@nanostores/react';
import { $auth, type AuthTone } from '@kbve/droid';

export interface SessionView {
	ready: boolean;
	authenticated: boolean;
	tone: AuthTone;
	userId: string;
	name: string;
	username: string | undefined;
	avatar: string | undefined;
	error: string | undefined;
}

export function useSession(): SessionView {
	const auth = useStore($auth);
	return {
		ready: auth.tone !== 'loading',
		authenticated: auth.tone === 'auth',
		tone: auth.tone,
		userId: auth.id,
		name: auth.name,
		username: auth.username,
		avatar: auth.avatar,
		error: auth.error,
	};
}
