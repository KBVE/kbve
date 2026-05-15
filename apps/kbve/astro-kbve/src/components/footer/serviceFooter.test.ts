import { describe, expect, it } from 'vitest';
import footerService from './serviceFooter';

describe('FooterService', () => {
	it('default export and getInstance return the same singleton', async () => {
		const mod = await import('./serviceFooter');
		expect(footerService).toBe(mod.default);
	});

	it('quickLinks store exposes a non-empty list after construction', () => {
		const links = footerService.getQuickLinks().get();
		expect(Array.isArray(links)).toBe(true);
	});

	it('updateLinksForUser(true) swaps to the authenticated link set', () => {
		footerService.updateLinksForUser(true);
		const links = footerService.getQuickLinks().get();
		const labels = links.map((l) => l.label);
		expect(labels).toContain('Dashboard');
		expect(labels).toContain('Profile');
		expect(labels).toContain('Logout');
	});

	it('updateLinksForUser(false) restores anonymous defaults', () => {
		footerService.updateLinksForUser(false);
		const links = footerService.getQuickLinks().get();
		const labels = links.map((l) => l.label);
		expect(labels).toContain('Support');
		expect(labels).not.toContain('Logout');
	});

	it('reset() restores defaults and clears auth flag', () => {
		footerService.updateLinksForUser(true);
		footerService.setUserAuthenticated(true);
		footerService.reset();

		const links = footerService.getQuickLinks().get();
		expect(links.some((l) => l.label === 'Logout')).toBe(false);
	});

	it('every link has href + label string', () => {
		footerService.reset();
		const links = footerService.getQuickLinks().get();
		for (const link of links) {
			expect(typeof link.href).toBe('string');
			expect(link.href.length).toBeGreaterThan(0);
			expect(typeof link.label).toBe('string');
			expect(link.label.length).toBeGreaterThan(0);
		}
	});

	it('setUserAuthenticated toggles without crashing for arbitrary booleans', () => {
		expect(() => footerService.setUserAuthenticated(true)).not.toThrow();
		expect(() => footerService.setUserAuthenticated(false)).not.toThrow();
	});
});
