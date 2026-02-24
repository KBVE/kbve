import { $auth } from './auth';
import { addToast } from './toasts';

let shown = false;

export function showWelcomeToast(): void {
	if (shown) return;

	const tryShow = (): boolean => {
		const auth = $auth.get();
		if (auth.tone === 'auth' && auth.name) {
			shown = true;
			addToast({
				id: `welcome-${Date.now()}`,
				message: `Welcome back, ${auth.name}`,
				severity: 'success',
				duration: 4000,
			});
			return true;
		}
		if (auth.tone === 'anon') {
			shown = true;
			addToast({
				id: `welcome-${Date.now()}`,
				message: 'Welcome!',
				severity: 'info',
				duration: 3000,
			});
			return true;
		}
		if (auth.tone === 'error') {
			shown = true;
			return true;
		}
		return false;
	};

	if (tryShow()) return;

	// Auth still loading — subscribe and wait (10s timeout)
	const timeoutId = setTimeout(() => {
		unsub();
		shown = true;
	}, 10_000);

	const unsub = $auth.subscribe(() => {
		if ($auth.get().tone === 'loading') return;
		clearTimeout(timeoutId);
		unsub();
		tryShow();
	});
}
