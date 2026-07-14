// Web off-main-thread: spin a one-shot Worker from the function source. `work`
// must be self-contained (its source is shipped to the Worker — closures over
// outer scope are lost), data comes via `arg`, result must be structured-
// cloneable. Mirrors the native worklet-runtime path.
export function runOffThread<R, A = undefined>(
	work: (arg: A) => R,
	arg?: A,
): Promise<R> {
	if (typeof Worker === 'undefined') {
		return Promise.resolve().then(() => work(arg as A));
	}
	return new Promise<R>((resolve, reject) => {
		const src =
			'self.onmessage=function(ev){' +
			'try{var f=(' +
			work.toString() +
			');self.postMessage({ok:true,v:f(ev.data)});}' +
			'catch(e){self.postMessage({ok:false,e:(e&&e.message)||String(e)});}' +
			'};';
		const url = URL.createObjectURL(
			new Blob([src], { type: 'application/javascript' }),
		);
		const worker = new Worker(url);
		const cleanup = () => {
			URL.revokeObjectURL(url);
			worker.terminate();
		};
		worker.onmessage = (ev: MessageEvent) => {
			cleanup();
			if (ev.data?.ok) resolve(ev.data.v as R);
			else reject(new Error(ev.data?.e ?? 'offthread error'));
		};
		worker.onerror = (e: ErrorEvent) => {
			cleanup();
			reject(new Error(e.message || 'worker error'));
		};
		worker.postMessage(arg ?? null);
	});
}
