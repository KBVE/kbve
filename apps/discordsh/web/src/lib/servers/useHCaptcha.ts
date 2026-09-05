import { useRef, useCallback, useEffect, useState } from 'react';

export const HCAPTCHA_SITEKEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';
const HCAPTCHA_SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js';

declare global {
	interface Window {
		hcaptcha?: {
			render: (
				container: HTMLElement,
				opts: Record<string, unknown>,
			) => string;
			execute: (
				widgetId: string,
				opts?: { async: boolean },
			) => Promise<{ response: string }>;
			reset: (widgetId: string) => void;
			remove: (widgetId: string) => void;
		};
	}
}

let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
	if (scriptLoaded) return Promise.resolve();
	if (scriptPromise) return scriptPromise;

	scriptPromise = new Promise<void>((resolve, reject) => {
		if (document.querySelector(`script[src="${HCAPTCHA_SCRIPT_URL}"]`)) {
			scriptLoaded = true;
			resolve();
			return;
		}
		const script = document.createElement('script');
		script.src = `${HCAPTCHA_SCRIPT_URL}?render=explicit`;
		script.async = true;
		script.onload = () => {
			scriptLoaded = true;
			resolve();
		};
		script.onerror = () => reject(new Error('Failed to load hCaptcha'));
		document.head.appendChild(script);
	});

	return scriptPromise;
}

export function useHCaptcha() {
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetIdRef = useRef<string | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let cancelled = false;

		loadScript().then(() => {
			if (cancelled || !containerRef.current || !window.hcaptcha) return;

			const id = window.hcaptcha.render(containerRef.current, {
				sitekey: HCAPTCHA_SITEKEY,
				size: 'invisible',
			});
			widgetIdRef.current = id;
			setReady(true);
		});

		return () => {
			cancelled = true;
			if (widgetIdRef.current !== null && window.hcaptcha) {
				window.hcaptcha.remove(widgetIdRef.current);
				widgetIdRef.current = null;
			}
		};
	}, []);

	const execute = useCallback(async (): Promise<string> => {
		if (!window.hcaptcha || widgetIdRef.current === null) {
			throw new Error('hCaptcha not ready');
		}
		const result = await window.hcaptcha.execute(widgetIdRef.current, {
			async: true,
		});
		return result.response;
	}, []);

	const reset = useCallback(() => {
		if (window.hcaptcha && widgetIdRef.current !== null) {
			window.hcaptcha.reset(widgetIdRef.current);
		}
	}, []);

	return { containerRef, ready, execute, reset };
}
