import dbWorkerUrl from '../../../../../packages/npm/droid/src/lib/workers/db-worker?worker&url';
import wsWorkerUrl from '../../../../../packages/npm/droid/src/lib/workers/ws-worker?worker&url';
import canvasWorkerUrl from '../../../../../packages/npm/droid/src/lib/workers/canvas-worker?worker&url';

export const workerURLs: Record<string, string> = {
	dbWorker: dbWorkerUrl,
	wsWorker: wsWorkerUrl,
	canvasWorker: canvasWorkerUrl,
};
