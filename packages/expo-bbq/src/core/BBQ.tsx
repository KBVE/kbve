import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

class BBQ {
	private static instance: BBQ;
	private router: any;

	private constructor() {
		// Singleton constructor
	}

	static getInstance(): BBQ {
		if (!BBQ.instance) {
			BBQ.instance = new BBQ();
		}
		return BBQ.instance;
	}

	initialize(router: any) {
		this.router = router;
	}

	go(route: string, params?: Record<string, any>) {
		if (route.startsWith('http://') || route.startsWith('https://')) {
			Linking.openURL(route).catch((err) => {
				console.error('Failed to open external link:', err);
			});
		} else {
			if (this.router) {
				if (this.router.canDismiss()) {
					this.router.dismissAll();
				}
				setTimeout(() => {
					this.router.navigate({
						pathname: route,
						params: params,
					});
				}, 0);
			} else {
				console.error('Router not initialized.');
			}
		}
	}
}

export const useBBQ = () => {
	const router = useRouter();

	useEffect(() => {
		const bbqInstance = BBQ.getInstance();
		bbqInstance.initialize(router);
	}, [router]);

	return BBQ.getInstance();
};
