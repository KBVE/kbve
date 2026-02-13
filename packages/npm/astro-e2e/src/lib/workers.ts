// Worker URL imports using Vite's ?worker&url static import syntax
// This avoids the dynamic new URL(template, import.meta.url) pattern
// that Vite's vite:worker-import-meta-url plugin rejects

import dbWorkerUrl from '../../../droid/src/lib/workers/db-worker?worker&url';
import wsWorkerUrl from '../../../droid/src/lib/workers/ws-worker?worker&url';
import canvasWorkerUrl from '../../../droid/src/lib/workers/canvas-worker?worker&url';

export const workerURLs: Record<string, string> = {
	dbWorker: dbWorkerUrl,
	wsWorker: wsWorkerUrl,
	canvasWorker: canvasWorkerUrl,
};
