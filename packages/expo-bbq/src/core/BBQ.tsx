import { useRouter, Router } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';

export class BBQ {
	private static instance: BBQ;
	private router: Router | null = null;
	private isMounted = false;
	private isLoading = false; // Add loading state

	private constructor() {
		// Singleton constructor
	}

	static getInstance(): BBQ {
		if (!BBQ.instance) {
			BBQ.instance = new BBQ();
		}
		return BBQ.instance;
	}

	initialize(router: Router) {
		this.router = router;
		this.isMounted = true; // Set as mounted once initialized
	}

	go(route: string, params?: Record<string, any>) {
		if (!this.isMounted) {
			console.error('Attempted to navigate before mounting.');
			return; // Exit early if not mounted
		}

		// Set loading to true when navigating
		this.setLoading(true);

		if (route.startsWith('http://') || route.startsWith('https://')) {
			Linking.openURL(route)
				.catch((err) => {
					console.error('Failed to open external link:', err);
				})
				.finally(() => this.setLoading(false)); // Stop loading after external link opens
		} else {
			if (this.router) {
				if (this.router.canDismiss()) {
					this.router.dismissAll();
				}
				setTimeout(() => {
					this.router?.navigate({
						pathname: route,
						params: params,
					});
					this.setLoading(false); // Stop loading after navigation
				}, 0);
			} else {
				console.error('Router not initialized.');
				this.setLoading(false); // Stop loading if router not initialized
			}
		}
	}

	// Function to set loading state
	setLoading(isLoading: boolean) {
		this.isLoading = isLoading;
		// You can trigger re-renders or global state updates here if needed
		console.log('Loading:', this.isLoading);
	}

	// Get the current loading state
	getLoadingState() {
		return this.isLoading;
	}

	resetMount() {
		this.isMounted = false; // Reset mount state
	}
}

export const useBBQ = () => {
	const router = useRouter();
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		const bbqInstance = BBQ.getInstance();
		bbqInstance.initialize(router);
		setIsMounted(true); // Set the state as mounted when the router is initialized

		return () => {
			bbqInstance.resetMount(); // Reset mount state on component unmount
			setIsMounted(false);
		};
	}, [router]);

	return BBQ.getInstance();
};
