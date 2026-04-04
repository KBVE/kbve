import { useCallback, type ReactNode } from 'react';
import { forgejoService } from './forgejoService';
import { AuthGate } from './dashboard-ui';

export default function ReactForgejoAuth({
	children,
}: {
	children: ReactNode;
}) {
	const initAuth = useCallback(() => forgejoService.initAuth(), []);
	return (
		<AuthGate
			$authState={forgejoService.$authState}
			initAuth={initAuth}
			serviceName="Git dashboard">
			{children}
		</AuthGate>
	);
}
