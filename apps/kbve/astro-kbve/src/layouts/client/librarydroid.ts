import { droid, modUrls, workerURLs, workerURLsDev } from '@kbve/droid';
import { proxy } from 'comlink';


function resolveWorkerURL(name: keyof typeof workerURLs): string {
  return new URL(workerURLs[name], import.meta.url).toString();
}

(async () => {
	
	console.log("[DROID] init Library");
	// await droid({ workerURLs });
	await droid({
		workerURLs: import.meta.env.DEV ? workerURLsDev : {
			canvasWorker: resolveWorkerURL('canvasWorker'),
			dbWorker: resolveWorkerURL('dbWorker'),
			wsWorker: resolveWorkerURL('wsWorker'),
		},
	});
	
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
		await bentoMod.instance.init(proxy({ emitFromWorker }));
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