/**
 * Syncs auth flags from $auth store to the <html> element.
 * Starlight menu items gate visibility via `data-auth-visibility` attrs,
 * which CSS resolves against `data-auth-tone` / `data-auth-flags` here.
 */
import { $auth, AuthFlags, hasAuthFlag } from '@kbve/droid';

function syncAuthFlags() {
	const { flags, tone } = $auth.get();
	const root = document.documentElement;

	root.dataset.authFlags = String(flags);

	if (tone === 'auth' || tone === 'anon') {
		root.dataset.authTone = hasAuthFlag(flags, AuthFlags.STAFF)
			? 'staff'
			: tone;
	}
}

$auth.subscribe(syncAuthFlags);
syncAuthFlags();
document.addEventListener('astro:after-swap', syncAuthFlags);
