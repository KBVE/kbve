export * from './lib/droid';
export * from './lib/types/bento';
export * from './lib/types/event-types';
export * from './lib/types/panel-types';
export * from './lib/types/ui-event-types';
export * from './lib/workers/events';
export * from './lib/mod/mod-urls';
export * from './lib/gateway';
export * from './lib/state';

export type { VirtualNode } from './lib/types/modules';

// Worker-side validation
export { validateUIMessage } from './lib/workers/validate';
export type {
	ValidatedWorkerMessage,
	UIMessageType,
} from './lib/workers/validate';

// Canvas UI renderer (for direct worker usage)
export { CanvasUIRenderer } from './lib/workers/canvas-ui-renderer';

// Vite ?worker&url imports — bundles each worker as JS and returns the URL string
import canvasWorkerUrl from './lib/workers/canvas-worker?worker&url';
import dbWorkerUrl from './lib/workers/db-worker?worker&url';
import wsWorkerUrl from './lib/workers/ws-worker?worker&url';
import supabaseSharedWorkerUrl from './lib/workers/supabase-shared-worker?worker&url';
import supabaseDbWorkerUrl from './lib/workers/supabase-db-worker?worker&url';

export const workerURLs = {
	canvasWorker: canvasWorkerUrl,
	dbWorker: dbWorkerUrl,
	wsWorker: wsWorkerUrl,
	supabaseSharedWorker: supabaseSharedWorkerUrl,
	supabaseDbWorker: supabaseDbWorkerUrl,
};

export const workerStrings = {
	canvasWorker: canvasWorkerUrl,
	dbWorker: dbWorkerUrl,
	wsWorker: wsWorkerUrl,
	supabaseSharedWorker: supabaseSharedWorkerUrl,
	supabaseDbWorker: supabaseDbWorkerUrl,
};
