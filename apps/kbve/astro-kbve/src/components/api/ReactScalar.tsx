import { useEffect, useRef } from 'react';
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

type ScalarInstance = { destroy?: () => void };

export default function ReactScalar({
	sources,
	specUrl = '/api/openapi.json',
	title = 'KBVE API Reference',
}: Props) {
	const hostRef = useRef<HTMLDivElement>(null);

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
		});

		const instance = createApiReference(el, config) as ScalarInstance;
		void attachScalarAuthBridge();

		return () => {
			try {
				instance?.destroy?.();
			} catch {
				/* already gone */
			}
		};
	}, []);

	return <div id="scalar-app" ref={hostRef} />;
}
