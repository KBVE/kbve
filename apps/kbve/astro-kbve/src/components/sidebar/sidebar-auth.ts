/**
 * Syncs auth flags from $auth store to the HTML element as a data attribute.
 * CSS uses this attribute to show/hide sidebar links based on auth state.
 *
 * data-auth-flags is the numeric bitmask — CSS selectors match against it.
 * data-auth-tone is preserved for backwards compat (ChuckRPG pattern).
 */
import { $auth, AuthFlags, hasAuthFlag } from '@kbve/droid';

function syncAuthFlags() {
	const { flags, tone } = $auth.get();
	const root = document.documentElement;

	// Set numeric flags attribute for bitwise CSS matching
	root.dataset.authFlags = String(flags);

	// Set tone for backwards-compat CSS selectors
	if (tone === 'auth' || tone === 'anon') {
		root.dataset.authTone = hasAuthFlag(flags, AuthFlags.STAFF)
			? 'staff'
			: tone;
	}
}

// Subscribe to auth state changes
$auth.subscribe(syncAuthFlags);

// Initial sync
syncAuthFlags();

// Re-sync after Astro client-side navigation (View Transitions)
document.addEventListener('astro:after-swap', syncAuthFlags);
