export interface UpdateResult<S, Eff> {
	state: S;
	effects: Eff[];
}

export interface Core<S, E, VM, Eff> {
	initial(): S;
	update(state: S, event: E): UpdateResult<S, Eff>;
	view(state: S): VM;
}

export interface EffectExecutor<Eff, E> {
	execute(effect: Eff, dispatch: (event: E) => void): void;
}

export function noopExecutor<Eff, E>(): EffectExecutor<Eff, E> {
	return { execute: () => undefined };
}

export class Store<S, E, VM, Eff> {
	private state: S;
	private snapshot: VM;
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly core: Core<S, E, VM, Eff>,
		private readonly executor: EffectExecutor<Eff, E> = noopExecutor<
			Eff,
			E
		>(),
	) {
		this.state = core.initial();
		this.snapshot = core.view(this.state);
	}

	getSnapshot = (): VM => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	dispatch = (event: E): void => {
		const { state, effects } = this.core.update(this.state, event);
		this.state = state;
		this.snapshot = this.core.view(state);
		this.listeners.forEach((listener) => listener());
		for (const effect of effects) {
			this.executor.execute(effect, this.dispatch);
		}
	};
}
