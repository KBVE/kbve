export type NavDir = 'forward' | 'back';

let navLock = false;
const NAV_DIR_KEY = 'kbve-ring-nav-dir';

/**
 * Classic full-page navigation with view-transition direction signal.
 * Stores direction in sessionStorage so the next page can position scroll
 * + animate the cross-document view transition correctly.
 */
export const ringNavigate = (href: string, dir: NavDir): void => {
	if (navLock) return;
	navLock = true;
	try {
		sessionStorage.setItem(NAV_DIR_KEY, dir);
		document.documentElement.dataset.navDir = dir;
	} catch {}
	window.location.href = href;
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
