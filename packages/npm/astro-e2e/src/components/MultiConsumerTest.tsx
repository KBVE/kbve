import { DroidProvider, useDroidContext } from '@kbve/astro';

function ConsumerA() {
	const state = useDroidContext();
	return (
		<div data-testid="consumer-a">
			<div data-testid="consumer-a-initialized" data-value={String(state.initialized)}>
				A initialized: {String(state.initialized)}
			</div>
			<div data-testid="consumer-a-events" data-value={String(state.hasEvents)}>
				A events: {String(state.hasEvents)}
			</div>
		</div>
	);
}

function ConsumerB() {
	const state = useDroidContext();
	return (
		<div data-testid="consumer-b">
			<div data-testid="consumer-b-initialized" data-value={String(state.initialized)}>
				B initialized: {String(state.initialized)}
			</div>
			<div data-testid="consumer-b-events" data-value={String(state.hasEvents)}>
				B events: {String(state.hasEvents)}
			</div>
		</div>
	);
}

function ConsumerC() {
	const state = useDroidContext();
	return (
		<div data-testid="consumer-c">
			<div data-testid="consumer-c-initialized" data-value={String(state.initialized)}>
				C initialized: {String(state.initialized)}
			</div>
			<div data-testid="consumer-c-events" data-value={String(state.hasEvents)}>
				C events: {String(state.hasEvents)}
			</div>
		</div>
	);
}

function DeeplyNestedConsumer() {
	const state = useDroidContext();
	return (
		<div data-testid="deep-consumer">
			<div data-testid="deep-consumer-initialized" data-value={String(state.initialized)}>
				Deep initialized: {String(state.initialized)}
			</div>
		</div>
	);
}

export function MultiConsumerTest({ workerURLs }: { workerURLs?: Record<string, string> }) {
	return (
		<div data-testid="multi-consumer-test">
			<h2>Multiple Context Consumers</h2>
			<DroidProvider workerURLs={workerURLs}>
				<ConsumerA />
				<ConsumerB />
				<ConsumerC />
				<div>
					<div>
						<div>
							<DeeplyNestedConsumer />
						</div>
					</div>
				</div>
			</DroidProvider>
		</div>
	);
}
