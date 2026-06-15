import { AuthGate, useAuth, useAuthActions } from '@kbve/rn/auth';
import { Screen, Stack, Text, Button } from '@kbve/rn/ui';

function SignedIn() {
	const auth = useAuth();
	const { signOut } = useAuthActions();
	return (
		<Screen center padded>
			<Stack gap="lg" align="center">
				<Text variant="display">KBVE Jobs</Text>
				<Text variant="subtitle" tone="muted">
					Signed in as @{auth.user?.username ?? auth.user?.email}
				</Text>
				<Button title="Browse jobs" onPress={() => undefined} />
				<Button
					title="Sign out"
					variant="secondary"
					onPress={() => signOut()}
				/>
			</Stack>
		</Screen>
	);
}

export function Landing() {
	// AuthGate shows the shared LoginScreen (email/password + Discord/GitHub/
	// Twitch OAuth + hCaptcha) when signed out, SetUsername when needed, else
	// the children.
	return (
		<AuthGate>
			<SignedIn />
		</AuthGate>
	);
}
