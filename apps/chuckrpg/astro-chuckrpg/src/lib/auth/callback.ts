import { authBridge } from '../supa';

function showError() {
	const messageEl = document.querySelector('.ck-status-message');
	const subMessageEl = document.querySelector('.ck-status-sub');
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
