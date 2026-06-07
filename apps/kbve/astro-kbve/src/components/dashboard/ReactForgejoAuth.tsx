import { useCallback, useEffect, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService } from './forgejoService';
import { AuthGate } from './dashboard-ui';

export default function ReactForgejoAuth({
	children,
}: {
	children: ReactNode;
}) {
	const initAuth = useCallback(() => forgejoService.initAuth(), []);
	const authState = useStore(forgejoService.$authState);

	useEffect(() => {
		if (authState !== 'authenticated') return;
		forgejoService.loadCacheAndFetch();
		return () => {
			forgejoService.dispose();
		};
	}, [authState]);

	return (
		<AuthGate
			$authState={forgejoService.$authState}
			initAuth={initAuth}
			serviceName="Git dashboard">
			{children}
		</AuthGate>
	);
}
