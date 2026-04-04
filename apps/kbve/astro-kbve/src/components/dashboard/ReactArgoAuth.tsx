import { useCallback, type ReactNode } from 'react';
import { argoService } from './argoService';
import { AuthGate } from './dashboard-ui';

export default function ReactArgoAuth({ children }: { children: ReactNode }) {
	const initAuth = useCallback(() => argoService.initAuth(), []);
	return (
		<AuthGate
			$authState={argoService.$authState}
			initAuth={initAuth}
			serviceName="deployment dashboard">
			{children}
		</AuthGate>
	);
}
