

export function dispatchAsync(fn: () => void) {
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(fn);
	} else {
		setTimeout(fn, 0);
	}
}