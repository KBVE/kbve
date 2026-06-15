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

// In dev, route supabase through the vite proxy (same-origin) to dodge CORS;
// in prod the SPA calls supabase.kbve.com directly (allowed *.kbve.com origin).
const supabaseUrl = import.meta.env.DEV
	? `${window.location.origin}/supabase`
	: KBVE_SUPABASE_URL;

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<KbveProvider
			supabaseUrl={supabaseUrl}
			anonKey={KBVE_SUPABASE_ANON_KEY}>
			<Landing />
			<OverlayHost />
			<ToastViewport />
		</KbveProvider>
	</StrictMode>,
);
