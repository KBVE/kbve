import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './useAuth';
import { LoginScreen } from './LoginScreen';

export function AuthGate({ children }: { children: ReactNode }) {
	const auth = useAuth();
	if (auth.status === 'loading') {
		return (
			<SafeAreaView style={styles.center}>
				<ActivityIndicator color="#2d6cdf" />
			</SafeAreaView>
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
