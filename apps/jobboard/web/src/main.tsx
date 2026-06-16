import 'react-native-url-polyfill/auto';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { Persister } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import { KbveProvider, KBVE_SUPABASE_ANON_KEY } from '@kbve/rn/auth';
import { OverlayHost, ToastViewport } from '@kbve/rn/ui';
import { createKvPersister } from '@kbve/rn/store';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import './styles.css';

// Same-origin Supabase: the vite dev server (:5401) and Axum (:5400 / jobs.kbve.com)
// both proxy /supabase -> supabase.kbve.com. No browser CORS, no Kong allow-list.
const supabaseUrl = `${window.location.origin}/supabase`;

const persister = createKvPersister('jobboard-rq') as unknown as Persister;

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<KbveProvider
			supabaseUrl={supabaseUrl}
			anonKey={KBVE_SUPABASE_ANON_KEY}
			apiBaseUrl={`${window.location.origin}/kbveapi`}>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={{ persister }}>
				{/* Public marketplace — browsing needs no auth. Login lives at the
				    /login route; KbveProvider supplies the session to the whole app. */}
				<RouterProvider router={router} />
			</PersistQueryClientProvider>
			<OverlayHost />
			<ToastViewport />
		</KbveProvider>
	</StrictMode>,
);
