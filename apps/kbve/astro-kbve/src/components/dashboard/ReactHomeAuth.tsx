import { useCallback, type ReactNode } from 'react';
import { homeService } from './homeService';
import { AuthGate } from './dashboard-ui';

export default function ReactHomeAuth({ children }: { children: ReactNode }) {
	const initAuth = useCallback(() => homeService.initAuth(), []);
	return (
		<AuthGate
			$authState={homeService.$authState}
			initAuth={initAuth}
			serviceName="dashboard">
			{children}
		</AuthGate>
	);
}
