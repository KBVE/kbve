import {
	Component,
	Fragment,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { useGLTF } from '@react-three/drei';

const MAX_RETRIES = 3;
const RETRY_MS = 900;

interface Failure {
	label: string;
	attempt: number;
	dead: boolean;
	message: string;
	at: number;
}

const failures = new Map<string, Failure>();
let snapshot: Failure[] = [];
const listeners = new Set<() => void>();

function publish(): void {
	snapshot = [...failures.values()];
	for (const l of listeners) l();
}

function note(f: Failure): void {
	failures.set(f.label, f);
	publish();
}

function clearNote(label: string): void {
	if (failures.delete(label)) publish();
}

export function useAssetFailures(): Failure[] {
	return useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => snapshot,
		() => snapshot,
	);
}

export function AssetFailureToast() {
	const fails = useAssetFailures();
	if (!fails.length) return null;
	const dead = fails.some((f) => f.dead);
	return (
		<div
			role="status"
			style={{
				position: 'fixed',
				top: 12,
				left: '50%',
				transform: 'translateX(-50%)',
				zIndex: 60,
				padding: '10px 16px',
				borderRadius: 6,
				border: `1px solid ${dead ? '#e07a5f' : '#d9a441'}`,
				background: 'rgba(10,10,14,0.92)',
				color: dead ? '#ffb4a0' : '#f0d08a',
				font: '12px monospace',
				pointerEvents: 'none',
				textAlign: 'center',
			}}>
			{fails.map((f) => (
				<div key={f.label} style={{ marginBottom: 2 }}>
					{f.dead
						? `${f.label} failed to load — gave up after ${MAX_RETRIES} tries`
						: `${f.label} failed to load — retrying (${f.attempt}/${MAX_RETRIES})`}
					<span style={{ opacity: 0.55 }}>{` · ${f.message}`}</span>
				</div>
			))}
		</div>
	);
}

// Last resort: anything that escapes the per-loader boundaries would otherwise
// unmount the whole tree to a bare black page with no explanation.
export class RootBoundary extends Component<
	{ children: ReactNode },
	{ message: string | null }
> {
	state: { message: string | null } = { message: null };

	static getDerivedStateFromError(error: Error) {
		return { message: error?.message ?? String(error) };
	}

	componentDidCatch(error: Error, info: { componentStack?: string | null }) {
		console.error(
			'[root] uncaught render error',
			error,
			info.componentStack,
		);
	}

	render(): ReactNode {
		if (this.state.message === null) return this.props.children;
		return (
			<div
				style={{
					position: 'fixed',
					inset: 0,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 14,
					background: '#06060a',
					color: '#e8e8ee',
					font: '13px ui-monospace, monospace',
					padding: 24,
					textAlign: 'center',
				}}>
				<div style={{ color: '#ffb4a0' }}>the game crashed</div>
				<div style={{ opacity: 0.7, maxWidth: 640 }}>
					{this.state.message}
				</div>
				<button
					onClick={() => window.location.reload()}
					style={{
						background: '#ffffff12',
						border: '1px solid #ffffff22',
						color: '#fff',
						padding: '6px 14px',
						borderRadius: 4,
						cursor: 'pointer',
						font: 'inherit',
					}}>
					reload
				</button>
			</div>
		);
	}
}

interface Props {
	label: string;
	children: ReactNode;
	urls?: readonly string[];
}

interface State {
	attempt: number;
	caught: boolean;
	dead: boolean;
}

// A rejected GLTF fetch throws through Suspense and, uncaught, takes down the
// whole Canvas to a black screen. Contain it per-loader: drop the drei cache
// entry so the retry refetches, then remount the subtree on a fresh key.
export class AssetBoundary extends Component<Props, State> {
	state: State = { attempt: 0, caught: false, dead: false };
	private timer: ReturnType<typeof setTimeout> | undefined;

	static getDerivedStateFromError(): Partial<State> {
		return { caught: true };
	}

	componentDidCatch(error: Error): void {
		if (this.state.dead) return;
		const { label, urls } = this.props;
		const attempt = this.state.attempt + 1;
		const message = error?.message ?? String(error);
		console.error(
			`[asset] ${label} threw (attempt ${attempt}/${MAX_RETRIES}): ${message}`,
		);
		if (attempt > MAX_RETRIES) {
			note({
				label,
				attempt: attempt - 1,
				dead: true,
				message,
				at: Date.now(),
			});
			this.setState({ dead: true, caught: false });
			return;
		}
		note({ label, attempt, dead: false, message, at: Date.now() });
		for (const u of urls ?? []) {
			try {
				useGLTF.clear(u);
			} catch {
				/* cache entry may not exist */
			}
		}
		this.timer = setTimeout(
			() => this.setState({ attempt, caught: false }),
			RETRY_MS * attempt,
		);
	}

	componentDidUpdate(_: Props, prev: State): void {
		if (prev.caught && !this.state.caught && !this.state.dead) {
			this.recovered();
		}
	}

	private recovered(): void {
		setTimeout(() => {
			if (!this.state.caught && !this.state.dead)
				clearNote(this.props.label);
		}, 2500);
	}

	componentWillUnmount(): void {
		clearTimeout(this.timer);
	}

	render(): ReactNode {
		if (this.state.dead || this.state.caught) return null;
		return (
			<Fragment key={this.state.attempt}>{this.props.children}</Fragment>
		);
	}
}
