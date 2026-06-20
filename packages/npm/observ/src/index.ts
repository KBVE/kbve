import { Observer } from './client';
import type { ObservConfig } from './types';

export { Observer } from './client';
export type { ErrorEvent, ObservConfig } from './types';

let singleton: Observer | null = null;

export function initObserv(config: ObservConfig): Observer {
	if (singleton) return singleton;
	singleton = new Observer(config).install();
	return singleton;
}

export function captureException(
	err: unknown,
	extra?: Record<string, unknown>,
): void {
	singleton?.captureException(err, extra);
}
