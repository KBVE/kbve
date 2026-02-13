import { DroidProvider, useDroidContext, DroidStatus } from '@kbve/astro';

function ContextConsumerInner() {
	const state = useDroidContext();

	return (
		<div data-testid="context-consumer">
			<div data-testid="ctx-initialized" data-value={String(state.initialized)}>
				Context Initialized: {state.initialized ? 'Yes' : 'No'}
			</div>
			<div data-testid="ctx-has-api" data-value={String(state.hasApi)}>
				Context API: {state.hasApi ? 'Ready' : 'Not loaded'}
			</div>
			<div data-testid="ctx-has-uiux" data-value={String(state.hasUiux)}>
				Context UIUX: {state.hasUiux ? 'Ready' : 'Not loaded'}
			</div>
			<div data-testid="ctx-has-events" data-value={String(state.hasEvents)}>
				Context Events: {state.hasEvents ? 'Ready' : 'Not loaded'}
			</div>
			<div data-testid="ctx-error" data-value={state.error ?? ''}>
				Context Error: {state.error ?? 'None'}
			</div>
		</div>
	);
}

export function ProviderTestHarness({ workerURLs }: { workerURLs?: Record<string, string> }) {
	return (
		<DroidProvider workerURLs={workerURLs}>
			<DroidStatus className="test-status" />
			<ContextConsumerInner />
		</DroidProvider>
	);
}
