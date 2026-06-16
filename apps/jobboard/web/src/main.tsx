import 'react-native-url-polyfill/auto';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { KbveProvider, KBVE_SUPABASE_ANON_KEY } from '@kbve/rn/auth';
import { AuthGate } from '@kbve/rn/auth';
import { OverlayHost, ToastViewport } from '@kbve/rn/ui';
import { router } from './router';
import './styles.css';

// Same-origin Supabase: the vite dev server (:5401) and Axum (:5400 / jobs.kbve.com)
// both proxy /supabase -> supabase.kbve.com. No browser CORS, no Kong allow-list.
const supabaseUrl = `${window.location.origin}/supabase`;

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<KbveProvider supabaseUrl={supabaseUrl} anonKey={KBVE_SUPABASE_ANON_KEY}>
			<QueryClientProvider client={queryClient}>
				{/* AuthGate shows the shared LoginScreen (email/pw + Discord/GitHub/
				    Twitch OAuth + hCaptcha) when signed out, SetUsername when needed,
				    else our marketplace SPA. */}
				<AuthGate>
					<RouterProvider router={router} />
				</AuthGate>
			</QueryClientProvider>
			<OverlayHost />
			<ToastViewport />
		</KbveProvider>
	</StrictMode>,
);
