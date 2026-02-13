import { Component, type ReactNode } from 'react';
import { useDroidContext } from '@kbve/astro';

class ErrorBoundary extends Component<
	{ children: ReactNode; fallback: (error: string) => ReactNode },
	{ error: string | null }
> {
	state = { error: null as string | null };

	static getDerivedStateFromError(error: Error) {
		return { error: error.message };
	}

	render() {
		if (this.state.error) return this.props.fallback(this.state.error);
		return this.props.children;
	}
}

function NakedContextConsumer() {
	const state = useDroidContext();
	return <div>{String(state.initialized)}</div>;
}

export function OutsideProviderTest() {
	return (
		<div data-testid="outside-provider-test">
			<ErrorBoundary
				fallback={(msg) => (
					<div data-testid="outside-error" data-value={msg}>
						Error: {msg}
					</div>
				)}
			>
				<NakedContextConsumer />
			</ErrorBoundary>
		</div>
	);
}
