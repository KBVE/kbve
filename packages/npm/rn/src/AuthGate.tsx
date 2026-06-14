import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from './useAuth';
import { LoginScreen } from './LoginScreen';

export function AuthGate({ children }: { children: ReactNode }) {
	const auth = useAuth();
	if (auth.status === 'loading') {
		return (
			<View style={styles.center}>
				<ActivityIndicator color="#2d6cdf" />
			</View>
		);
	}
	if (!auth.signedIn) {
		return <LoginScreen />;
	}
	return <>{children}</>;
}

const styles = StyleSheet.create({
	center: {
		flex: 1,
		backgroundColor: '#0b0b0f',
		alignItems: 'center',
		justifyContent: 'center',
	},
});
