export * from './lib/droid';
export * from './lib/types/bento';
export * from './lib/types/event-types';
export * from './lib/types/panel-types';
export * from './lib/workers/events';
export * from './lib/mod/mod-urls';
export * from './lib/gateway';

export const workerURLs = {
	canvasWorker: new URL(
		'./lib/workers/canvas-worker.js',
		import.meta.url,
	),
	dbWorker: new URL('./lib/workers/db-worker.js', import.meta.url),
	wsWorker: new URL('./lib/workers/ws-worker.js', import.meta.url),
	supabaseSharedWorker: new URL(
		'./lib/workers/supabase-shared-worker.js',
		import.meta.url,
	),
	supabaseDbWorker: new URL(
		'./lib/workers/supabase-db-worker.js',
		import.meta.url,
	),
};

export const workerStrings = {
	canvasWorker: new URL(
		'./lib/workers/canvas-worker.js',
		import.meta.url,
	).toString(),
	dbWorker: new URL('./lib/workers/db-worker.js', import.meta.url).toString(),
	wsWorker: new URL('./lib/workers/ws-worker.js', import.meta.url).toString(),
	supabaseSharedWorker: new URL(
		'./lib/workers/supabase-shared-worker.js',
		import.meta.url,
	).toString(),
	supabaseDbWorker: new URL(
		'./lib/workers/supabase-db-worker.js',
		import.meta.url,
	).toString(),
};
