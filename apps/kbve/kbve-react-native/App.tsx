import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
	AgentStore,
	AuthGate,
	createWebSocketExecutor,
	KbveProvider,
	KBVE_SUPABASE_ANON_KEY,
	KBVE_SUPABASE_URL,
	tsCore,
	useAgent,
	useAuth,
	useAuthActions,
	RN_PACKAGE_VERSION,
} from '@kbve/rn';

const store = new AgentStore(tsCore, createWebSocketExecutor());

function Home() {
	const auth = useAuth();
	const { signOut } = useAuthActions();
	const vm = useAgent(store);
	return (
		<View style={styles.container}>
			<Text style={styles.title}>KBVE</Text>
			<Text style={styles.line}>@kbve/rn v{RN_PACKAGE_VERSION}</Text>
			<Text style={styles.line}>
				signed in: {auth.username ?? auth.user?.email ?? 'unknown'}
			</Text>
			<Text style={styles.line}>connection: {vm.connection}</Text>
			<Text style={styles.line}>agent: {vm.status}</Text>
			<Pressable
				style={styles.button}
				onPress={() => store.dispatch({ type: 'open_session' })}>
				<Text style={styles.buttonText}>open session</Text>
			</Pressable>
			<Pressable style={styles.linkButton} onPress={signOut}>
				<Text style={styles.linkText}>sign out</Text>
			</Pressable>
		</View>
	);
}

export default function App() {
	return (
		<KbveProvider
			supabaseUrl={KBVE_SUPABASE_URL}
			anonKey={KBVE_SUPABASE_ANON_KEY}>
			<AuthGate>
				<Home />
			</AuthGate>
			<StatusBar style="auto" />
		</KbveProvider>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#0b0b0f',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
	},
	title: { color: '#fff', fontSize: 32, fontWeight: '700' },
	line: { color: '#9aa0a6', fontSize: 14 },
	button: {
		marginTop: 16,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		backgroundColor: '#2d6cdf',
	},
	buttonText: { color: '#fff', fontWeight: '600' },
	linkButton: { marginTop: 12 },
	linkText: { color: '#6b7280', fontSize: 13 },
});
