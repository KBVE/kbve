import { AuthGate } from '@kbve/rn/auth';
import { DashboardShell } from './layout/DashboardShell';

export function Landing() {
	// AuthGate shows the shared LoginScreen (email/password + Discord/GitHub/
	// Twitch OAuth + hCaptcha) when signed out, SetUsername when needed, else
	// the dashboard.
	return (
		<AuthGate>
			<DashboardShell />
		</AuthGate>
	);
}
