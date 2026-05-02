// boot.ts — Initialize droid workers + Supabase auth for chat.kbve.com
//
// Call once early (e.g. in a layout or top-level component).
// After this resolves, window.kbve.ws is available for WebSocket chat.

import { droid } from '@kbve/droid';
import { workerURLs } from './workers';
import { initSupa } from './supa';

let _bootPromise: Promise<void> | null = null;
let _diagnosticsAttached = false;

function attachDiagnostics(): void {
	if (_diagnosticsAttached || typeof window === 'undefined') return;
	_diagnosticsAttached = true;

	window.addEventListener('unhandledrejection', (ev) => {
		const reason = ev.reason;
		const name = reason?.name ?? 'UnhandledRejection';
		const message = reason?.message ?? String(reason);
		const stack = reason?.stack ?? '(no stack)';
		console.error(
			`[chat:diag] unhandled rejection — ${name}: ${message}\n${stack}`,
			reason,
		);
	});

	window.addEventListener('error', (ev) => {
		console.error(
			`[chat:diag] window error — ${ev.message} at ${ev.filename}:${ev.lineno}:${ev.colno}`,
			ev.error,
		);
	});
}

/**
 * Boot droid workers and Supabase auth in parallel.
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export function bootChat(): Promise<void> {
	if (_bootPromise) return _bootPromise;
	attachDiagnostics();

	_bootPromise = (async () => {
		// Boot droid (workers) and auth in parallel
		const [droidResult] = await Promise.all([
			droid({ workerURLs, initTimeout: 15_000 }),
			initSupa(),
		]);

		if (!droidResult.initialized) {
			throw new Error('Droid worker initialization failed');
		}

		console.log('[chat] Boot complete — droid + auth ready');
	})().catch((e) => {
		_bootPromise = null;
		throw e;
	});

	return _bootPromise;
}
