import { Observer } from './client';
import type { ObservConfig } from './types';

export { Observer } from './client';
export type { ErrorEvent, ObservConfig } from './types';
export type { Breadcrumb } from './breadcrumbs';

let singleton: Observer | null = null;

/// Browser entry: installs window error/rejection handlers + DOM/fetch breadcrumbs.
export function initObserv(config: ObservConfig): Observer {
	if (singleton) return singleton;
	singleton = new Observer(config).install();
	return singleton;
}

/// React Native entry: hooks `ErrorUtils.setGlobalHandler`, no DOM/beacon
/// (flush falls back to fetch keepalive, which RN supports).
export function initObservNative(config: ObservConfig): Observer {
	if (singleton) return singleton;
	singleton = new Observer({ platform: 'android', ...config }).installNative();
	return singleton;
}

export function captureException(
	err: unknown,
	extra?: Record<string, unknown>,
): void {
	singleton?.captureException(err, extra);
}

export function addBreadcrumb(
	message: string,
	data?: Record<string, unknown>,
): void {
	singleton?.breadcrumb(message, data);
}
