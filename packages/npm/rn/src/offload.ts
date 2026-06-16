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

// Run a self-contained function off the main thread. `work` must not close over
// outer state (it crosses a thread boundary — a worklet on native, a Worker on
// web); pass data via `arg`, copied across. Result must be serializable. Use for
// chunky compute, not hot loops (per-call thread hop).
export function runOffThread<R, A = undefined>(
	work: (arg: A) => R,
	arg?: A,
): Promise<R> {
	return new Promise<R>((resolve, reject) => {
		const settle = (value: R) => resolve(value);
		const fail = (message: string) => reject(new Error(message));
		runOnRuntime(getRuntime(), (a: A) => {
			'worklet';
			try {
				const result = work(a);
				runOnJS(settle)(result);
			} catch (error) {
				runOnJS(fail)(
					error instanceof Error ? error.message : 'offthread error',
				);
			}
		})(arg as A);
	});
}
