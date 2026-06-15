import 'react-native-url-polyfill/auto';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
	KbveProvider,
	KBVE_SUPABASE_URL,
	KBVE_SUPABASE_ANON_KEY,
} from '@kbve/rn/auth';
import { OverlayHost, ToastViewport } from '@kbve/rn/ui';
import { Landing } from './Landing';
import './styles.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<KbveProvider
			supabaseUrl={KBVE_SUPABASE_URL}
			anonKey={KBVE_SUPABASE_ANON_KEY}>
			<Landing />
			<OverlayHost />
			<ToastViewport />
		</KbveProvider>
	</StrictMode>,
);
