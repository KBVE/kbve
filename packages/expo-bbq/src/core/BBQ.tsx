import React, {useEffect} from 'react';
import { useRouter, Router } from 'expo-router';
import * as Linking from 'expo-linking';

export class BBQ {
	private static instance: BBQ;
	private router: Router | null = null;
	private isLoading = false;

	private constructor() {
		//
	}

	static getInstance(): BBQ {
		if (!BBQ.instance) {
			BBQ.instance = new BBQ();
		}
		return BBQ.instance;
	}

	initialize(router: Router) {
		this.router = router;
	}

	go(route: string, params?: Record<string, any>) {
		this.setLoading(true);

		if (route.startsWith('http://') || route.startsWith('https://')) {
			// External link handling
			Linking.openURL(route)
				.catch((err) => console.error('Failed to open external link:', err))
				.finally(() => this.setLoading(false));
		} else {
			// Internal navigation handling
			if (this.router) {
				// Dismiss all modals or screens if possible
				if (this.router.canDismiss()) {
					this.router.dismissAll();
				}
				// Use a timeout to allow dismiss animations or transitions to complete
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

	setLoading(isLoading: boolean) {
		this.isLoading = isLoading;
		console.log('Loading:', this.isLoading);
	}

	getLoadingState() {
		return this.isLoading;
	}
}

// Hook to initialize BBQ and provide the instance
export const useBBQ = () => {
	const router = useRouter();

	useEffect(() => {
		const bbqInstance = BBQ.getInstance();
		bbqInstance.initialize(router);
	}, [router]);

	return BBQ.getInstance();
};
