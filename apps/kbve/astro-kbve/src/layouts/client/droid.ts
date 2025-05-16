import { droid, modUrls } from '@kbve/droid';
import { proxy } from 'comlink';

(async () => {
	await droid(); // guarantees window.kbve is initialized

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

	console.log('[KBVE] Bento mod loaded');
})();