import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
	onExit: () => void;
	children: ReactNode;
}

interface State {
	error: Error | null;
}

/**
 * Contains failures from the 3D space scenes (react-three-fiber Canvas + THREE
 * loaders). Entering a flight view mounts a second WebGL context on top of the
 * paused Phaser one; in constrained webviews (Discord Activity) that second
 * context — or an asset load — can throw, which without a boundary unmounts the
 * whole React tree (a hard "crash"). Here it degrades to a recoverable panel and
 * logs the real error so the cause is visible instead of a blank screen.
 */
export class SpaceErrorBoundary extends Component<Props, State> {
	state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		console.error('[arpg] space scene crashed', error, info.componentStack);
	}

	render(): ReactNode {
		if (!this.state.error) return this.props.children;
		return (
			<div
				style={{
					position: 'absolute',
					inset: 0,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 14,
					fontFamily: 'monospace',
					color: '#eaf2ff',
					textAlign: 'center',
					padding: 24,
					background:
						'radial-gradient(ellipse at 50% 40%, #0a1230 0%, #03040c 70%, #000 100%)',
				}}>
				<div
					style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
					Could not enter orbit
				</div>
				<div style={{ fontSize: 13, color: '#9fb3d8', maxWidth: 360 }}>
					The flight view failed to start (graphics context or
					assets).
				</div>
				<pre
					style={{
						fontSize: 11,
						color: '#ff9a9a',
						maxWidth: 420,
						maxHeight: 160,
						overflow: 'auto',
						whiteSpace: 'pre-wrap',
						margin: 0,
						padding: 8,
						background: 'rgba(0,0,0,0.4)',
						borderRadius: 6,
					}}>
					{this.state.error.message}
				</pre>
				<button
					onClick={this.props.onExit}
					style={{
						minWidth: 240,
						padding: '12px 20px',
						fontFamily: 'monospace',
						fontSize: 14,
						color: '#03040c',
						background: '#69b7ff',
						border: '1px solid #69b7ff',
						borderRadius: 8,
						cursor: 'pointer',
					}}>
					Return to Planet
				</button>
			</div>
		);
	}
}
