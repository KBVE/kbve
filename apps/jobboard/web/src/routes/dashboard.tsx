import { AuthGate } from '@kbve/rn/auth';
import { DashboardShell } from '../layout/DashboardShell';

export function DashboardPage() {
	return (
		<AuthGate>
			<DashboardShell />
		</AuthGate>
	);
}
