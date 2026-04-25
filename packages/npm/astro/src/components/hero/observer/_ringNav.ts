export type NavDir = 'forward' | 'back';

let navLock = false;
const prefetched = new Set<string>();

export const ringNavigate = async (
	href: string,
	dir: NavDir,
): Promise<void> => {
	if (navLock) return;
	navLock = true;
	try {
		document.documentElement.dataset.navDir = dir;
		// @ts-expect-error — astro virtual module resolved at runtime by the consumer app
		const transitions = await import('astro:transitions/client');
		await transitions.navigate(href, {
			history: 'auto',
		});
	} catch {
		window.location.href = href;
	} finally {
		// Long lock to absorb post-nav wheel inertia and double-fire from
		// momentum scroll. Released by the new page's first idle tick.
		window.setTimeout(() => {
			navLock = false;
		}, 1500);
	}
};

export const isRingNavLocked = (): boolean => navLock;

/**
 * Pre-warm chain neighbors so the next ring nav swaps instantly.
 * Idempotent — same href is only fetched once per session.
 */
export const ringPrefetch = (href: string | null | undefined): void => {
	if (!href || prefetched.has(href)) return;
	prefetched.add(href);
	const link = document.createElement('link');
	link.rel = 'prefetch';
	link.href = href;
	link.as = 'document';
	document.head.appendChild(link);
};
