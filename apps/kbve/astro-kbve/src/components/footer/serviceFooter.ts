import { atom } from 'nanostores';

/**
 * Footer link interface
 */
export interface FooterLink {
	href: string;
	label: string;
	prefetch?: boolean;
	external?: boolean;
}

/**
 * FooterService - Manages dynamic footer state with nanostores
 */
class FooterService {
	private static instance: FooterService | null = null;

	private quickLinksStore = atom<FooterLink[]>([]);
	private isAuthenticatedStore = atom<boolean>(false);

	private constructor() {
		if (typeof window !== 'undefined') {
			this.initializeDefaults();
		}
	}

	public static getInstance(): FooterService {
		if (!FooterService.instance) {
			FooterService.instance = new FooterService();
		}
		return FooterService.instance;
	}

	private initializeDefaults(): void {
		this.quickLinksStore.set([
			{ href: '/dashboard/', label: 'Dashboard', prefetch: true },
			{ href: '/project/', label: 'Projects', prefetch: true },
			{ href: '/analysis/', label: 'Analytics', prefetch: true },
			{ href: '/settings/', label: 'Settings', prefetch: true },
			{ href: '/support/', label: 'Support', prefetch: true },
		]);
	}

	public getQuickLinks() {
		return this.quickLinksStore;
	}

	public setUserAuthenticated(authenticated: boolean): void {
		this.isAuthenticatedStore.set(authenticated);
	}

	public updateLinksForUser(isAuthenticated: boolean): void {
		if (isAuthenticated) {
			this.quickLinksStore.set([
				{ href: '/dashboard/', label: 'Dashboard', prefetch: true },
				{ href: '/profile/', label: 'Profile', prefetch: true },
				{ href: '/project/', label: 'My Projects', prefetch: true },
				{ href: '/settings/', label: 'Settings', prefetch: true },
				{ href: '/logout/', label: 'Logout', prefetch: false },
			]);
		} else {
			this.initializeDefaults();
		}
	}

	public reset(): void {
		this.initializeDefaults();
		this.isAuthenticatedStore.set(false);
	}
}

export const footerService = FooterService.getInstance();
export default footerService;
