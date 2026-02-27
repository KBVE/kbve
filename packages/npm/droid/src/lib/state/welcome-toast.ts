import { $auth } from './auth';
import { addToast } from './toasts';

const SHOWN_KEY = 'kbve:welcome-shown';

function hasShown(): boolean {
	try {
		return sessionStorage.getItem(SHOWN_KEY) === '1';
	} catch {
		return false;
	}
}

function markShown(): void {
	try {
		sessionStorage.setItem(SHOWN_KEY, '1');
	} catch {
		/* private browsing / storage full */
	}
}

export function showWelcomeToast(): void {
	if (hasShown()) return;

	const tryShow = (): boolean => {
		const auth = $auth.get();
		if (auth.tone === 'auth' && auth.name) {
			markShown();
			addToast({
				id: `welcome-${Date.now()}`,
				message: `Welcome back, ${auth.name}`,
				severity: 'success',
				duration: 4000,
			});
			return true;
		}
		if (auth.tone === 'anon') {
			markShown();
			addToast({
				id: `welcome-${Date.now()}`,
				message: 'Welcome!',
				severity: 'info',
				duration: 3000,
			});
			return true;
		}
		if (auth.tone === 'error') {
			markShown();
			return true;
		}
		return false;
	};

	if (tryShow()) return;

	// Auth still loading — subscribe and wait (10s timeout)
	const timeoutId = setTimeout(() => {
		unsub();
		if (!hasShown()) {
			markShown();
			addToast({
				id: `welcome-${Date.now()}`,
				message: 'Welcome!',
				severity: 'info',
				duration: 3000,
			});
		}
	}, 10_000);

	const unsub = $auth.subscribe(() => {
		if ($auth.get().tone === 'loading') return;
		clearTimeout(timeoutId);
		unsub();
		tryShow();
	});
}
