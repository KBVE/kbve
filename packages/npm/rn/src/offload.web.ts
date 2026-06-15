export function runOffThread<R>(work: () => R): Promise<R> {
	return Promise.resolve().then(work);
}
