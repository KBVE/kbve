import { useCallback } from 'react';
import { clickhouseService } from './clickhouseService';
import { AuthGate } from './dashboard-ui';

export default function ReactCHAuth({
	children,
}: {
	children: React.ReactNode;
}) {
	const initAuth = useCallback(() => clickhouseService.initAuth(), []);
	return (
		<AuthGate
			$authState={clickhouseService.$authState}
			initAuth={initAuth}
			serviceName="ClickHouse logs dashboard">
			{children}
		</AuthGate>
	);
}
