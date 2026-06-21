import { captureException, initObserv } from '@kbve/observ';

let currentUserId: string | undefined;

export function setObservUserId(id: string | undefined): void {
	currentUserId = id;
}

export function initJobboardObserv(): void {
	initObserv({
		endpoint: 'https://metrics.kbve.com/api/v1/ingest/errors',
		project: 'jobboard',
		platform: 'web',
		environment: import.meta.env.MODE,
		getUserId: () => currentUserId,
	});
}

export { captureException };
