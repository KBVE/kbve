import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initObservNative } from '@kbve/observ';
import {
	AgentStore,
	AuthGate,
	createWebSocketExecutor,
	HomeScreen,
	HomeView,
	KbveProvider,
	KBVE_SUPABASE_ANON_KEY,
	KBVE_SUPABASE_URL,
	OverlayHost,
	ToastViewport,
	tsCore,
} from '@kbve/rn';
import './WgpuHost';

initObservNative({
	endpoint: 'https://metrics.kbve.com/api/v1/ingest/errors',
	project: 'kbve-react-native',
	platform: Platform.OS === 'ios' ? 'ios' : 'android',
	environment: __DEV__ ? 'development' : 'production',
});

const store = new AgentStore(tsCore, createWebSocketExecutor());

export default function App() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<KbveProvider
				supabaseUrl={KBVE_SUPABASE_URL}
				anonKey={KBVE_SUPABASE_ANON_KEY}>
				<AuthGate>
					<HomeView />
				</AuthGate>
				<OverlayHost />
				<ToastViewport />
				<StatusBar style="auto" />
			</KbveProvider>
		</GestureHandlerRootView>
	);
}
