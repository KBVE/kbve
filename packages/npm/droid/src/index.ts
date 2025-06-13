export * from './lib/droid';
export * from './lib/types/bento';
export * from './lib/mod/mod-urls';
export const workerURLsDev = {
	canvasWorker: new URL(
		'./lib/workers/canvas-worker.js',
		import.meta.url,
	).toString(),
	dbWorker: new URL('./lib/workers/db-worker.js', import.meta.url).toString(),
	wsWorker: new URL('./lib/workers/ws-worker.js', import.meta.url).toString(),
};
export const workerURLs = {
	canvasWorker: '/workers/canvas-worker.mjs',
	dbWorker: '/workers/db-worker.mjs',
	wsWorker: '/workers/ws-worker.mjs',
};
