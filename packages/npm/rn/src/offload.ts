import {
	createWorkletRuntime,
	runOnJS,
	runOnRuntime,
} from 'react-native-worklets';

let offThreadRuntime: ReturnType<typeof createWorkletRuntime> | null = null;

function getRuntime() {
	if (!offThreadRuntime) {
		offThreadRuntime = createWorkletRuntime({ name: 'kbve-offthread' });
	}
	return offThreadRuntime;
}

export function runOffThread<R>(work: () => R): Promise<R> {
	return new Promise<R>((resolve, reject) => {
		const settle = (value: R) => resolve(value);
		const fail = (message: string) => reject(new Error(message));
		runOnRuntime(getRuntime(), () => {
			'worklet';
			try {
				const result = work();
				runOnJS(settle)(result);
			} catch (error) {
				runOnJS(fail)(
					error instanceof Error ? error.message : 'offthread error',
				);
			}
		})();
	});
}
