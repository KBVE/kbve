import { droid, modUrls, workerStrings} from '@kbve/droid';
import * as comlink from 'comlink';

const astroStrings = {
		canvasWorker: new Worker(new URL('/assets/canvas-worker.js', window.location.origin), { type: 'module' }),
		dbWorker: new SharedWorker(new URL('/assets/db-worker.js', window.location.origin),  { type: 'module' }),
		wsWorker: new SharedWorker(new URL('/assets/ws-worker.js', window.location.origin),  { type: 'module' }),
};


(async () => {
	
	console.log("[DROID] init Library");
	if (import.meta.env.DEV) {
		await droid({ workerURLs: workerStrings });
	} else {
		await droid({ workerRefs: astroStrings, workerURLs: workerStrings });
	}	
	const mod = window.kbve?.mod;
	const emitFromWorker = window.kbve?.uiux?.emitFromWorker;

	if (!mod) {
		console.error('[KBVE] Mod manager not available');
		return;
	}

	const bentoMod = await mod.load(modUrls.bento);

	console.log('[DEBUG] Loaded mod ID:', bentoMod?.id);
	console.log('[DEBUG] Registry keys:', Object.keys(mod.registry));
	
	if (bentoMod?.instance?.init && typeof emitFromWorker === 'function') {
		await bentoMod.instance.init(comlink.proxy({ emitFromWorker }));
	}

	if (bentoMod?.meta) {
		console.log(`[Event] Bento Mod Firing`)
		window.kbve?.events?.emit('droid-mod-ready', {
			meta: bentoMod.meta,
			timestamp: Date.now(),
		});
	}

	console.log('[KBVE] Bento mod loaded');
})();


// const workerRefs = {
// 			canvasWorker: new Worker((new URL(RawWorkerURLs.canvasWorker), import.meta.url), { type: 'module' }),
// 			dbWorker: new SharedWorker((new URL(RawWorkerURLs.dbWorker), import.meta.url),  { type: 'module' }),
// 			wsWorker: new SharedWorker((new URL(RawWorkerURLs.wsWorker), import.meta.url),  { type: 'module' }),
// 	};

// console.log(workerRefs);

	// await droid({
	// 	workerRefs: {
	// 		canvasWorker: new Worker((new URL(workerURLs.canvasWorker), import.meta.url), { type: 'module' }),
	// 		dbWorker: new SharedWorker((new URL(workerURLs.dbWorker), import.meta.url),  { type: 'module' }),
	// 		wsWorker: new SharedWorker((new URL(workerURLs.wsWorker), import.meta.url),  { type: 'module' }),
	// 	},
	// });