import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { ideService, type RunResult } from './ideService';
import { vmService } from './vmService';
import {
	Play,
	Square,
	Flame,
	Clock,
	AlertCircle,
	CheckCircle2,
} from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

function PhaseIndicator({ phase }: { phase: string }) {
	const config: Record<
		string,
		{ icon: React.ReactNode; color: string; label: string }
	> = {
		idle: { icon: <Flame size={14} />, color: '#6b7280', label: 'Ready' },
		creating: {
			icon: <Clock size={14} />,
			color: '#f59e0b',
			label: 'Creating VM...',
		},
		running: {
			icon: <Clock size={14} />,
			color: '#3b82f6',
			label: 'Running...',
		},
		completed: {
			icon: <CheckCircle2 size={14} />,
			color: '#22c55e',
			label: 'Completed',
		},
		failed: {
			icon: <AlertCircle size={14} />,
			color: '#ef4444',
			label: 'Failed',
		},
	};
	const { icon, color, label } = config[phase] ?? config.idle;
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				color,
				fontSize: '0.8rem',
				fontWeight: 500,
			}}>
			{icon} {label}
		</span>
	);
}

function OutputPanel({
	result,
	error,
}: {
	result: RunResult | null;
	error: string | null;
}) {
	if (error) {
		return (
			<div
				style={{
					padding: '1rem',
					color: '#ef4444',
					fontFamily: 'monospace',
					fontSize: '0.85rem',
					whiteSpace: 'pre-wrap',
				}}>
				{error}
			</div>
		);
	}
	if (!result) {
		return (
			<div
				style={{
					padding: '1rem',
					color: 'rgba(255,255,255,0.3)',
					fontSize: '0.85rem',
				}}>
				Output will appear here after running your code.
			</div>
		);
	}

	return (
		<div
			style={{
				padding: '1rem',
				fontFamily: 'monospace',
				fontSize: '0.85rem',
				whiteSpace: 'pre-wrap',
			}}>
			{result.stdout && (
				<div
					style={{
						color: '#e6edf3',
						marginBottom: result.stderr ? '0.75rem' : 0,
					}}>
					{result.stdout}
				</div>
			)}
			{result.stderr && (
				<div style={{ color: '#f97316' }}>{result.stderr}</div>
			)}
			<div
				style={{
					marginTop: '0.75rem',
					paddingTop: '0.5rem',
					borderTop: '1px solid rgba(255,255,255,0.08)',
					fontSize: '0.75rem',
					color: 'rgba(255,255,255,0.4)',
					display: 'flex',
					gap: '1rem',
				}}>
				<span>Exit: {result.exit_code}</span>
				<span>Duration: {result.duration_ms}ms</span>
				<span>VM: {result.vm_id.slice(0, 15)}</span>
			</div>
		</div>
	);
}

export default function ReactCodeIDE() {
	const token = useStore(vmService.$accessToken);
	const phase = useStore(ideService.$phase);
	const result = useStore(ideService.$result);
	const error = useStore(ideService.$error);
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);

	// Initialize CodeMirror
	useEffect(() => {
		if (!editorRef.current || viewRef.current) return;

		const state = EditorState.create({
			doc: ideService.$code.get(),
			extensions: [
				basicSetup,
				python(),
				oneDark,
				EditorView.updateListener.of((update) => {
					if (update.docChanged) {
						ideService.$code.set(update.state.doc.toString());
					}
				}),
				EditorView.theme({
					'&': { height: '100%', fontSize: '14px' },
					'.cm-scroller': { overflow: 'auto' },
					'.cm-content': { minHeight: '200px' },
				}),
			],
		});

		const view = new EditorView({
			state,
			parent: editorRef.current,
		});

		viewRef.current = view;

		return () => {
			view.destroy();
			viewRef.current = null;
		};
	}, []);

	const handleRun = useCallback(() => {
		if (token && phase !== 'creating' && phase !== 'running') {
			ideService.run(token);
		}
	}, [token, phase]);

	const handleCancel = useCallback(() => {
		ideService.cancel();
	}, []);

	if (!token) return null;

	const isRunning = phase === 'creating' || phase === 'running';

	return (
		<div
			className="not-content"
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: '0',
				color: 'var(--sl-color-text, #e6edf3)',
				minHeight: '60vh',
			}}>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: '1rem',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
					}}>
					<Flame size={22} style={{ color: '#f97316' }} />
					<h2
						style={{
							margin: 0,
							fontSize: '1.2rem',
							fontWeight: 600,
						}}>
						Firecracker IDE
					</h2>
					<span
						style={{
							fontSize: '0.75rem',
							color: 'rgba(255,255,255,0.4)',
							background: 'rgba(255,255,255,0.05)',
							padding: '0.15rem 0.5rem',
							borderRadius: '4px',
						}}>
						Python 3 · alpine-python · 128 MiB
					</span>
				</div>
				<PhaseIndicator phase={phase} />
			</div>

			{/* Editor + Output split */}
			<div
				style={{
					display: 'grid',
					gridTemplateRows: '1fr auto',
					border: '1px solid rgba(255,255,255,0.08)',
					borderRadius: '12px',
					overflow: 'hidden',
					background: '#0a0a0a',
				}}>
				{/* Code editor */}
				<div
					ref={editorRef}
					style={{
						height: 300,
						overflow: 'auto',
						borderBottom: '1px solid rgba(255,255,255,0.08)',
					}}
				/>

				{/* Run bar */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '0.5rem 1rem',
						background: 'rgba(255,255,255,0.02)',
						borderBottom: '1px solid rgba(255,255,255,0.08)',
					}}>
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						{isRunning ? (
							<button
								onClick={handleCancel}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: '0.3rem',
									padding: '0.4rem 1rem',
									background: '#ef444422',
									border: '1px solid #ef444444',
									borderRadius: '6px',
									color: '#ef4444',
									fontSize: '0.85rem',
									cursor: 'pointer',
									fontWeight: 500,
								}}>
								<Square size={14} />
								Cancel
							</button>
						) : (
							<button
								onClick={handleRun}
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: '0.3rem',
									padding: '0.4rem 1rem',
									background: '#22c55e22',
									border: '1px solid #22c55e44',
									borderRadius: '6px',
									color: '#22c55e',
									fontSize: '0.85rem',
									cursor: 'pointer',
									fontWeight: 500,
								}}>
								<Play size={14} />
								Run
							</button>
						)}
					</div>
					<span
						style={{
							fontSize: '0.7rem',
							color: 'rgba(255,255,255,0.3)',
						}}>
						Code runs in a Firecracker microVM with full hardware
						isolation
					</span>
				</div>

				{/* Output */}
				<div
					style={{
						minHeight: 120,
						maxHeight: 300,
						overflow: 'auto',
						background: '#0d1117',
					}}>
					<OutputPanel result={result} error={error} />
				</div>
			</div>
		</div>
	);
}
