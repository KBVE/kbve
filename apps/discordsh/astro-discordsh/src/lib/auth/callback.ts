/**
 * OAuth callback handler — extracted from inline auth/callback.astro script.
 * Handles the OAuth redirect, stores the session via authBridge,
 * and redirects the user home.
 */

import { authBridge } from '../supa';

function showError() {
	const messageEl = document.querySelector('.message');
	const subMessageEl = document.querySelector('.sub-message');
	if (messageEl) messageEl.textContent = 'Authentication failed';
	if (subMessageEl) subMessageEl.textContent = 'Redirecting...';
	setTimeout(() => {
		window.location.href = '/';
	}, 2000);
}

export async function handleAuthCallback() {
	try {
		const session = await Promise.race([
			authBridge.handleCallback(),
			new Promise<null>((_, reject) =>
				setTimeout(
					() => reject(new Error('Auth callback timed out')),
					10_000,
				),
			),
		]);

		if (session) {
			window.location.href = '/';
		} else {
			showError();
		}
	} catch (error) {
		console.error('Auth callback error:', error);
		showError();
	}
}

handleAuthCallback();
