import { useEffect, useRef, useState } from 'react';
import { createApiReference } from '@scalar/api-reference';
import { getConfiguration } from '@scalar/client-side-rendering';
import '@scalar/api-reference/style.css';
import { attachScalarAuthBridge } from '@/components/api/scalar-auth-bridge';
import { DASH_PROXY_BASE } from '@/components/rnweb/dashProxyBase';

interface Source {
	url: string;
	slug?: string;
	title: string;
	default?: boolean;
}

interface Props {
	sources?: Source[];
	specUrl?: string;
	title?: string;
}

type ScalarInstance = {
	updateConfiguration?: (cfg: Record<string, unknown>) => void;
	destroy?: () => void;
};
type Status = 'loading' | 'ready' | 'error';

export default function ReactScalar({
	sources,
	specUrl = '/api/openapi.json',
	title = 'KBVE API Reference',
}: Props) {
	const hostRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<Status>('loading');

	useEffect(() => {
		const el = hostRef.current;
		if (!el) return;

		const prefixed = sources?.map((s) => ({
			...s,
			url: `${DASH_PROXY_BASE}${s.url}`,
		}));

		const config = getConfiguration({
			...(prefixed && prefixed.length > 0
				? { sources: prefixed }
				: { url: `${DASH_PROXY_BASE}${specUrl}` }),
			theme: 'none',
			hideClientButton: false,
			defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
			metaData: { title },
			// Route "Try it" requests for relative-server specs through the
			// dev proxy (→ kbve.com, same-origin, no CORS). Empty in prod.
			...(DASH_PROXY_BASE ? { baseServerURL: DASH_PROXY_BASE } : {}),
		});

		const instance = createApiReference(el, config) as ScalarInstance;
		// The auth bridge reads these to inject the Supabase JWT into the
		// live instance (and re-inject on token refresh).
		window.__scalarRef = instance;
		window.__scalarBaseConfig = config as Record<string, unknown>;
		void attachScalarAuthBridge();

		// Scalar renders asynchronously (mounts its shell, then fetches the
		// specs). Flip to 'ready' once its DOM lands; fall back to 'error'
		// if nothing rendered within the timeout (e.g. every spec 404'd).
		const observer = new MutationObserver(() => {
			if (el.querySelector('.scalar-app')) {
				setStatus('ready');
				observer.disconnect();
			}
		});
		observer.observe(el, { childList: true, subtree: true });

		const timer = window.setTimeout(() => {
			setStatus((s) => (s === 'ready' ? s : 'error'));
		}, 12000);

		return () => {
			observer.disconnect();
			window.clearTimeout(timer);
			try {
				instance?.destroy?.();
			} catch {
				/* already gone */
			}
			if (window.__scalarRef === instance) {
				window.__scalarRef = undefined;
			}
		};
	}, []);

	return (
		<div className="scalar-host" data-status={status}>
			<div id="scalar-app" ref={hostRef} />
			{status === 'loading' && (
				<div className="scalar-state" role="status" aria-live="polite">
					<span className="scalar-spinner" aria-hidden="true" />
					<span>Loading API reference…</span>
				</div>
			)}
			{status === 'error' && (
				<div className="scalar-state scalar-state--error" role="alert">
					<span>Couldn’t load the API specs.</span>
					<span className="scalar-state__hint">
						The OpenAPI endpoints may be unreachable — check your
						connection or sign-in.
					</span>
				</div>
			)}
		</div>
	);
}
