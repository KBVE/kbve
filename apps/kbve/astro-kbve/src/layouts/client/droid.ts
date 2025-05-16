import { droid, modUrls } from '@kbve/droid';
import { proxy } from 'comlink';



droid().then(async () => {
	console.log('[KBVE] Droid initialized');

	try {
		const bentoMod = await window.kbve?.mod?.load(modUrls.bento);

		console.log('[KBVE] Bento mod loaded:', bentoMod?.meta);

		const emitFromWorker  = window.kbve?.uiux?.emitFromWorker;

		if (bentoMod?.instance?.init && typeof emitFromWorker  === 'function') {
			await bentoMod.instance.init(	proxy({ emitFromWorker }) );
		}


		await bentoMod.instance.run({
			title: '✅ Working!',
			icon: '🧪',
			subtitle: 'here',
			description: 'Triggered with proxied emitter, if it works?',
			primaryColor: 'emerald-500',
			secondaryColor: 'cyan-600',
			variant: 'default',
			span: 'col-span-2 row-span-2',
		});
		
		console.log('[KBVE] Bento mod loaded');
		// await bentoMod.instance.run({
		// 	title: "✅ Working!",
		// 	icon: "🧪",
		// 	description: "Triggered directly from bentoMod",
		// 	variant: "default",
		// 	span: "col-span-2 row-span-1"
		// });
	} catch (err) {
		console.error('[KBVE] Failed to load Bento mod:', err);
	}
});