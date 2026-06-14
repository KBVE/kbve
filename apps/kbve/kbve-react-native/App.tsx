import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
	AgentStore,
	createWebSocketExecutor,
	tsCore,
	useAgent,
	RN_PACKAGE_VERSION,
} from '@kbve/rn';

const store = new AgentStore(tsCore, createWebSocketExecutor());

export default function App() {
	const vm = useAgent(store);
	return (
		<View style={styles.container}>
			<Text style={styles.title}>KBVE</Text>
			<Text style={styles.line}>@kbve/rn v{RN_PACKAGE_VERSION}</Text>
			<Text style={styles.line}>connection: {vm.connection}</Text>
			<Text style={styles.line}>agent: {vm.status}</Text>
			<Pressable
				style={styles.button}
				onPress={() => store.dispatch({ type: 'open_session' })}>
				<Text style={styles.buttonText}>open session</Text>
			</Pressable>
			<StatusBar style="auto" />
		</View>
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
	title: {
		color: '#fff',
		fontSize: 32,
		fontWeight: '700',
	},
	line: {
		color: '#9aa0a6',
		fontSize: 14,
	},
	button: {
		marginTop: 16,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		backgroundColor: '#2d6cdf',
	},
	buttonText: {
		color: '#fff',
		fontWeight: '600',
	},
});
