/**
 * Sign-out handler — extracted from inline auth/logout.astro script.
 * Signs out via authBridge, clears all local auth state, and redirects home.
 */

import { authBridge } from '../supa';

export async function handleLogout() {
	// Each step is independent — failures must not block subsequent cleanup.
	try {
		await authBridge.signOut();
	} catch (err) {
		console.log('[Logout] signOut skipped:', err);
	}

	try {
		await authBridge.destroy();
	} catch (err) {
		console.warn('[Logout] destroy error:', err);
	}

	try {
		Object.keys(localStorage).forEach((key) => {
			if (key.includes('supabase') || key.includes('sb-')) {
				localStorage.removeItem(key);
			}
		});
	} catch (err) {
		console.warn('[Logout] localStorage cleanup error:', err);
	}

	// Always redirect — even if cleanup partially failed
	const messageEl = document.querySelector('.message');
	const subMessageEl = document.querySelector('.sub-message');
	if (messageEl) messageEl.textContent = 'Signed out successfully';
	if (subMessageEl) subMessageEl.textContent = 'Redirecting to home...';

	setTimeout(() => {
		window.location.href = '/?_=' + Date.now();
	}, 500);
}

handleLogout();
