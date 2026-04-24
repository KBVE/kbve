export type NavDir = 'forward' | 'back';

let navLock = false;

export const ringNavigate = async (
	href: string,
	dir: NavDir,
): Promise<void> => {
	if (navLock) return;
	navLock = true;
	try {
		document.documentElement.dataset.navDir = dir;
		const transitions = await import('astro:transitions/client');
		await transitions.navigate(href, {
			history: 'auto',
		});
	} catch {
		window.location.href = href;
	} finally {
		window.setTimeout(() => {
			navLock = false;
		}, 600);
	}
};

export const isRingNavLocked = (): boolean => navLock;
