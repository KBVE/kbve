/**
 * Sign-out handler — extracted from inline auth/logout.astro script.
 * Signs out via authBridge, clears all local auth state, and redirects home.
 */

import { authBridge } from '../supa';

export async function handleLogout() {
	try {
		try {
			await authBridge.signOut();
		} catch (err) {
			console.log('[Logout] AuthBridge sign-out skipped:', err);
		}

		try {
			await authBridge.destroy();
		} catch (err) {
			console.warn('[Logout] AuthBridge destroy error:', err);
		}

		// Clear localStorage supabase keys
		Object.keys(localStorage).forEach((key) => {
			if (key.includes('supabase') || key.includes('sb-')) {
				localStorage.removeItem(key);
			}
		});

		const messageEl = document.querySelector('.message');
		const subMessageEl = document.querySelector('.sub-message');
		if (messageEl) messageEl.textContent = 'Signed out successfully';
		if (subMessageEl) subMessageEl.textContent = 'Redirecting to home...';

		setTimeout(() => {
			window.location.href = '/?_=' + Date.now();
		}, 500);
	} catch (error) {
		console.error('[Logout] Sign-out error:', error);
		const messageEl = document.querySelector('.message');
		const subMessageEl = document.querySelector('.sub-message');
		if (messageEl) messageEl.textContent = 'Sign-out error occurred';
		if (subMessageEl) subMessageEl.textContent = 'Redirecting to home...';

		setTimeout(() => {
			window.location.href = '/?_=' + Date.now();
		}, 1000);
	}
}

handleLogout();
