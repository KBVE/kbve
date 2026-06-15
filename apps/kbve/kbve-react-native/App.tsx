import { StatusBar } from 'expo-status-bar';
import {
	AgentStore,
	AuthGate,
	createWebSocketExecutor,
	HomeScreen,
	KbveProvider,
	KBVE_SUPABASE_ANON_KEY,
	KBVE_SUPABASE_URL,
	OverlayHost,
	ToastViewport,
	tsCore,
} from '@kbve/rn';

const store = new AgentStore(tsCore, createWebSocketExecutor());

export default function App() {
	return (
		<KbveProvider
			supabaseUrl={KBVE_SUPABASE_URL}
			anonKey={KBVE_SUPABASE_ANON_KEY}>
			<AuthGate>
				<HomeScreen store={store} />
			</AuthGate>
			<OverlayHost />
			<ToastViewport />
			<StatusBar style="auto" />
		</KbveProvider>
	);
}
