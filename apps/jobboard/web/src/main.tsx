import 'react-native-url-polyfill/auto';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { Persister } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import { KbveProvider, KBVE_SUPABASE_ANON_KEY, useKbve } from '@kbve/rn/auth';
import { OverlayHost, ThemeProvider, ToastViewport } from '@kbve/rn/ui';
import { createKvPersister } from '@kbve/rn/store';
import { router } from './router';
import { DevBanner } from './components/DevBanner';
import { setAuthTokenGetter } from './api/client';
import { queryClient } from './lib/queryClient';
import { jobboardTheme } from './lib/theme';
import './styles.css';

// Same-origin Supabase: the vite dev server (:5401) and Axum (:5400 / jobs.kbve.com)
// both proxy /supabase -> supabase.kbve.com. No browser CORS, no Kong allow-list.
const supabaseUrl = `${window.location.origin}/supabase`;

const persister = createKvPersister('jobboard-rq') as unknown as Persister;

// Bridges the live Supabase session into the API seam so authed /api calls
// (vetting, admin) carry a bearer token. Renders nothing.
function AuthBridge() {
	const { client } = useKbve();
	useEffect(() => {
		setAuthTokenGetter(async () => {
			const { data } = await client.auth.getSession();
			return data.session?.access_token ?? null;
		});
	}, [client]);
	return null;
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<KbveProvider
			supabaseUrl={supabaseUrl}
			anonKey={KBVE_SUPABASE_ANON_KEY}
			apiBaseUrl={`${window.location.origin}/kbveapi`}
			oauthUrl="https://supabase.kbve.com">
			<AuthBridge />
			<ThemeProvider theme={jobboardTheme}>
				<PersistQueryClientProvider
					client={queryClient}
					persistOptions={{ persister }}>
					<DevBanner />
					{/* Public marketplace — browsing needs no auth. Login
					    lives at /login; KbveProvider supplies the session. */}
					<RouterProvider router={router} />
				</PersistQueryClientProvider>
				<OverlayHost />
				<ToastViewport />
			</ThemeProvider>
		</KbveProvider>
	</StrictMode>,
);
