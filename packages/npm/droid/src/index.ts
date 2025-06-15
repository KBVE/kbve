export * from './lib/droid';
export * from './lib/types/bento';
export * from './lib/mod/mod-urls';

export const workerURLs = {
	canvasWorker: new URL(
		'./lib/workers/canvas-worker.js',
		import.meta.url,
	),
	dbWorker: new URL('./lib/workers/db-worker.js', import.meta.url),
	wsWorker: new URL('./lib/workers/ws-worker.js', import.meta.url),
};

export const workerURLs2 = {
	canvasWorker: new URL('./lib/workers/canvas-worker.ts', import.meta.url),
	dbWorker: new URL('./lib/workers/db-worker.ts', import.meta.url),
	wsWorker: new URL('./lib/workers/ws-worker.ts', import.meta.url),
};

export const workerStrings2 = {
	canvasWorker: workerURLs.canvasWorker.toString(),
	dbWorker: workerURLs.dbWorker.toString(),
	wsWorker: workerURLs.wsWorker.toString(),
};

export const workerStringsAstro = {
	canvasWorker: new URL(
		'./lib/workers/canvas-worker.js?url&worker&noinline',
		import.meta.url,
	).toString(),
	dbWorker: new URL('./lib/workers/db-worker.js?url&sharedworker&noinline', import.meta.url).toString(),
	wsWorker: new URL('./lib/workers/ws-worker.js?url&sharedworker&noinline', import.meta.url).toString(),
};

export const workerStrings = {
	canvasWorker: new URL(
		'./lib/workers/canvas-worker.js',
		import.meta.url,
	).toString(),
	dbWorker: new URL('./lib/workers/db-worker.js', import.meta.url).toString(),
	wsWorker: new URL('./lib/workers/ws-worker.js', import.meta.url).toString(),
};