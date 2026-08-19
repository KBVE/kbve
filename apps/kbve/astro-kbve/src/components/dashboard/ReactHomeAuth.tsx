import { useCallback, useLayoutEffect, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { homeService } from './homeService';
import { AuthGate } from './dashboard-ui';

interface Props {
	skeletonId?: string;
	children: ReactNode;
}

export default function ReactHomeAuth({ skeletonId, children }: Props) {
	const initAuth = useCallback(() => homeService.initAuth(), []);
	const authState = useStore(homeService.$authState);

	useLayoutEffect(() => {
		if (skeletonId && authState !== 'loading') {
			document.getElementById(skeletonId)?.remove();
		}
	}, [skeletonId, authState]);

	return (
		<AuthGate
			$authState={homeService.$authState}
			initAuth={initAuth}
			serviceName="dashboard"
			fallback={skeletonId ? null : undefined}>
			{children}
		</AuthGate>
	);
}
