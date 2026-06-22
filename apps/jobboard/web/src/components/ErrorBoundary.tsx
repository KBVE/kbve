import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../lib/observ';

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
}

function DefaultFallback() {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '100vh',
				gap: '1rem',
				padding: '2rem',
				textAlign: 'center',
				fontFamily: 'system-ui, sans-serif',
			}}>
			<h1 style={{ fontSize: '1.25rem', margin: 0 }}>
				Something went wrong
			</h1>
			<p style={{ margin: 0, opacity: 0.7 }}>
				The error was reported. Try reloading the page.
			</p>
			<button
				type="button"
				onClick={() => window.location.reload()}
				style={{
					padding: '0.5rem 1rem',
					borderRadius: '0.5rem',
					border: '1px solid currentColor',
					background: 'transparent',
					cursor: 'pointer',
				}}>
				Reload
			</button>
		</div>
	);
}

export class ErrorBoundary extends Component<Props, State> {
	state: State = { hasError: false };

	static getDerivedStateFromError(): State {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		captureException(error, { componentStack: info.componentStack });
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback ?? <DefaultFallback />;
		}
		return this.props.children;
	}
}
