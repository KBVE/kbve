import type { AgentCore } from './reducer';
import type { AgentViewModel, CoreEffect, CoreEvent, CoreState } from './state';

export interface EffectExecutor {
	execute(effect: CoreEffect, dispatch: (event: CoreEvent) => void): void;
}

export const noopExecutor: EffectExecutor = {
	execute: () => undefined,
};

export class AgentStore {
	private state: CoreState;
	private snapshot: AgentViewModel;
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly core: AgentCore,
		private readonly executor: EffectExecutor = noopExecutor,
	) {
		this.state = core.initial();
		this.snapshot = core.view(this.state);
	}

	getSnapshot = (): AgentViewModel => this.snapshot;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	dispatch = (event: CoreEvent): void => {
		const { state, effects } = this.core.update(this.state, event);
		this.state = state;
		this.snapshot = this.core.view(state);
		this.listeners.forEach((listener) => listener());
		for (const effect of effects) {
			this.executor.execute(effect, this.dispatch);
		}
	};
}
