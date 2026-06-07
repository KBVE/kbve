export type NavDir = 'forward' | 'back';

let navLock = false;
const NAV_DIR_KEY = 'kbve-ring-nav-dir';

export const ringNavigate = (href: string, dir: NavDir): void => {
	if (navLock) return;
	navLock = true;
	try {
		sessionStorage.setItem(NAV_DIR_KEY, dir);
		document.documentElement.dataset.navDir = dir;
	} catch {}
	type AstroNav = (
		url: string,
		opts?: { history?: 'push' | 'replace'; state?: unknown },
	) => void;
	const w = window as unknown as {
		__astroNavigate?: AstroNav;
	};
	const astroNav: AstroNav | undefined = w.__astroNavigate;
	if (astroNav) {
		astroNav(href);
		setTimeout(() => {
			navLock = false;
		}, 600);
		return;
	}
	import('astro:transitions/client')
		.then(({ navigate }) => {
			w.__astroNavigate = navigate as AstroNav;
			navigate(href);
			setTimeout(() => {
				navLock = false;
			}, 600);
		})
		.catch(() => {
			window.location.href = href;
		});
};

export const isRingNavLocked = (): boolean => navLock;

/**
 * Read + clear the direction stored by the previous page's ringNavigate.
 * Returns null when arrival was not via the ring (direct hit, refresh, etc).
 */
export const consumeRingNavDir = (): NavDir | null => {
	try {
		const dir = sessionStorage.getItem(NAV_DIR_KEY) as NavDir | null;
		if (dir) sessionStorage.removeItem(NAV_DIR_KEY);
		return dir;
	} catch {
		return null;
	}
};
