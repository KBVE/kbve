import { StatusBar } from 'expo-status-bar';
import {
	AuthGate,
	ChatScreen,
	DashboardScreen,
	HomeView,
	KbveProvider,
	KBVE_SUPABASE_ANON_KEY,
	KBVE_SUPABASE_URL,
	NavShell,
	OverlayHost,
	ToastViewport,
} from '@kbve/rn';
import './WgpuHost';
import { TypeGpuCanvas } from './TypeGpuCanvas';

export default function UiPreview() {
	return (
		<KbveProvider
			supabaseUrl={KBVE_SUPABASE_URL}
			anonKey={KBVE_SUPABASE_ANON_KEY}>
			<AuthGate>
				<NavShell
					routes={[
						{
							id: 'home',
							label: 'Home',
							icon: 'home',
							screen: <HomeView />,
							appBar: false,
						},
						{
							id: 'dashboard',
							label: 'Dashboard',
							icon: 'grid',
							screen: <DashboardScreen />,
							title: 'Dashboard',
						},
						{
							id: 'chat',
							label: 'Chat',
							icon: 'chatbubble',
							screen: <ChatScreen />,
							title: 'Chat',
						},
						{
							id: 'fx',
							label: 'FX',
							icon: 'sparkles',
							screen: <TypeGpuCanvas />,
							title: 'GPU FX',
						},
					]}
				/>
			</AuthGate>
			<OverlayHost />
			<ToastViewport />
			<StatusBar style="auto" />
		</KbveProvider>
	);
}
