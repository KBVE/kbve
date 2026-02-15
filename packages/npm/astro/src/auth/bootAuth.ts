import { $auth, type SupabaseGateway } from '@kbve/droid';

let _booted = false;

function pushSession(session: any) {
	if (!session?.user) {
		$auth.set({
			tone: 'anon',
			name: '',
			avatar: undefined,
			id: '',
			error: undefined,
		});
		return;
	}
	const u = session.user;
	$auth.set({
		tone: 'auth',
		name:
			u.user_metadata?.full_name ||
			u.user_metadata?.name ||
			u.email?.split('@')[0] ||
			'User',
		avatar:
			u.user_metadata?.avatar_url ||
			u.user_metadata?.picture ||
			undefined,
		id: u.id ?? '',
		error: undefined,
	});
}

export async function bootAuth(gateway: SupabaseGateway): Promise<void> {
	if (_booted) return;
	_booted = true;

	try {
		const s = await gateway.getSession().catch(() => null);
		pushSession(s?.session ?? null);

		gateway.on('auth', (msg: any) => pushSession(msg.session ?? null));
	} catch (e: any) {
		$auth.set({
			tone: 'error',
			name: '',
			avatar: undefined,
			id: '',
			error: e?.message ?? 'Failed to initialize auth',
		});
	}
}
