import 'react-native-url-polyfill/auto';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { KbveProvider, KBVE_SUPABASE_ANON_KEY } from '@kbve/rn/auth';
import { OverlayHost, ToastViewport } from '@kbve/rn/ui';
import { Landing } from './Landing';
import './styles.css';

// Always talk to supabase through our own origin: the vite dev server (:5401)
// and the Axum service (:5400 / jobs.kbve.com) both proxy /supabase ->
// supabase.kbve.com. Same-origin everywhere = no browser CORS, no Kong origin
// allow-list dependency.
const supabaseUrl = `${window.location.origin}/supabase`;

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<KbveProvider
			supabaseUrl={supabaseUrl}
			anonKey={KBVE_SUPABASE_ANON_KEY}
			apiBaseUrl={`${window.location.origin}/kbveapi`}>
			<Landing />
			<OverlayHost />
			<ToastViewport />
		</KbveProvider>
	</StrictMode>,
);
