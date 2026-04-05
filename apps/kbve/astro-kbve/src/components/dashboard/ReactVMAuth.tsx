import { useCallback, type ReactNode } from 'react';
import { vmService } from './vmService';
import { AuthGate } from './dashboard-ui';

export default function ReactVMAuth({ children }: { children: ReactNode }) {
	const initAuth = useCallback(() => vmService.initAuth(), []);
	return (
		<AuthGate
			$authState={vmService.$authState}
			initAuth={initAuth}
			serviceName="VM dashboard">
			{children}
		</AuthGate>
	);
}
