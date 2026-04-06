import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	ideService,
	PRESETS,
	EXAMPLES,
	type RunResult,
	type HistoryEntry,
} from './ideService';
import { vmService } from './vmService';
import {
	Play,
	Square,
	Flame,
	Clock,
	AlertCircle,
	Trash2,
	Copy,
	CheckCircle2,
} from 'lucide-react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Extension } from '@codemirror/state';

function langExtension(language: string): Extension {
	switch (language) {
		case 'python':
			return python();
		case 'javascript':
			return javascript();
		default:
			return [];
	}
}

function PhaseIndicator({
	phase,
	elapsed,
}: {
	phase: string;
	elapsed: number;
}) {
	const timer =
		elapsed > 0 && (phase === 'creating' || phase === 'running')
			? ` ${(elapsed / 1000).toFixed(1)}s`
			: '';
	const config: Record<
		string,
		{ icon: React.ReactNode; color: string; label: string }
	> = {
		idle: { icon: <Flame size={14} />, color: '#6b7280', label: 'Ready' },
		creating: {
			icon: <Clock size={14} />,
			color: '#f59e0b',
			label: `Creating VM...${timer}`,
		},
		running: {
			icon: <Clock size={14} />,
			color: '#3b82f6',
			label: `Running...${timer}`,
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

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			onClick={() => {
				navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
			title="Copy to clipboard"
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: '0.25rem',
				padding: '0.2rem 0.5rem',
				background: 'rgba(255,255,255,0.05)',
				border: '1px solid rgba(255,255,255,0.1)',
				borderRadius: '4px',
				color: copied ? '#22c55e' : 'rgba(255,255,255,0.4)',
				fontSize: '0.7rem',
				cursor: 'pointer',
			}}>
			<Copy size={12} />
			{copied ? 'Copied' : 'Copy'}
		</button>
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

	const fullOutput = [result.stdout, result.stderr]
		.filter(Boolean)
		.join('\n');

	return (
		<div
			style={{
				padding: '1rem',
				fontFamily: 'monospace',
				fontSize: '0.85rem',
				whiteSpace: 'pre-wrap',
				position: 'relative',
			}}>
			<div
				style={{
					position: 'absolute',
					top: '0.5rem',
					right: '0.5rem',
				}}>
				<CopyButton text={fullOutput} />
			</div>
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
	const preset = useStore(ideService.$preset);
	const editorRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const langCompartment = useRef(new Compartment());
	const [elapsed, setElapsed] = useState(0);
	const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const runRef = useRef<(() => void) | null>(null);

	// Keep runRef current so the keymap closure always calls the latest handler
	runRef.current = () => {
		if (token && phase !== 'creating' && phase !== 'running') {
			ideService.run(token);
		}
	};

	// Elapsed timer — ticks every 100ms while running
	useEffect(() => {
		if (phase === 'creating' || phase === 'running') {
			const start = Date.now();
			setElapsed(0);
			elapsedRef.current = setInterval(() => {
				setElapsed(Date.now() - start);
			}, 100);
		} else {
			if (elapsedRef.current) {
				clearInterval(elapsedRef.current);
				elapsedRef.current = null;
			}
		}
		return () => {
			if (elapsedRef.current) clearInterval(elapsedRef.current);
		};
	}, [phase]);

	// Initialize CodeMirror
	useEffect(() => {
		if (!editorRef.current || viewRef.current) return;

		const state = EditorState.create({
			doc: ideService.$code.get(),
			extensions: [
				basicSetup,
				langCompartment.current.of(langExtension(preset.language)),
				oneDark,
				keymap.of([
					{
						key: 'Mod-Enter',
						run: () => {
							runRef.current?.();
							return true;
						},
					},
				]),
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Switch language when preset changes
	useEffect(() => {
		if (viewRef.current) {
			viewRef.current.dispatch({
				effects: langCompartment.current.reconfigure(
					langExtension(preset.language),
				),
			});
		}
	}, [preset.language]);

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
					<select
						value={preset.id}
						onChange={(e) =>
							ideService.selectPreset(e.target.value)
						}
						disabled={phase === 'creating' || phase === 'running'}
						style={{
							fontSize: '0.75rem',
							color: 'rgba(255,255,255,0.8)',
							background: 'rgba(255,255,255,0.05)',
							border: '1px solid rgba(255,255,255,0.1)',
							padding: '0.25rem 0.5rem',
							borderRadius: '6px',
							cursor: 'pointer',
						}}>
						{PRESETS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label} — {p.description}
							</option>
						))}
					</select>
					{(() => {
						const langExamples = EXAMPLES.filter(
							(ex) => ex.language === preset.language,
						);
						if (langExamples.length === 0) return null;
						return (
							<select
								value=""
								onChange={(e) => {
									const ex = EXAMPLES.find(
										(x) => x.id === e.target.value,
									);
									if (ex) {
										ideService.$code.set(ex.code);
										if (viewRef.current) {
											viewRef.current.dispatch({
												changes: {
													from: 0,
													to: viewRef.current.state
														.doc.length,
													insert: ex.code,
												},
											});
										}
									}
								}}
								disabled={isRunning}
								style={{
									fontSize: '0.75rem',
									color: 'rgba(255,255,255,0.8)',
									background: 'rgba(255,255,255,0.05)',
									border: '1px solid rgba(255,255,255,0.1)',
									padding: '0.25rem 0.5rem',
									borderRadius: '6px',
									cursor: 'pointer',
								}}>
								<option value="" disabled>
									📖 Examples…
								</option>
								{langExamples.map((ex) => (
									<option key={ex.id} value={ex.id}>
										{ex.label}
									</option>
								))}
							</select>
						);
					})()}
				</div>
				<PhaseIndicator phase={phase} elapsed={elapsed} />
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
							<>
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
								{(result || error) && (
									<button
										onClick={() => {
											ideService.$result.set(null);
											ideService.$error.set(null);
											ideService.$phase.set('idle');
										}}
										style={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: '0.3rem',
											padding: '0.4rem 0.75rem',
											background:
												'rgba(255,255,255,0.03)',
											border: '1px solid rgba(255,255,255,0.08)',
											borderRadius: '6px',
											color: 'rgba(255,255,255,0.5)',
											fontSize: '0.85rem',
											cursor: 'pointer',
										}}>
										<Trash2 size={14} />
										Clear
									</button>
								)}
							</>
						)}
					</div>
					<span
						style={{
							fontSize: '0.7rem',
							color: 'rgba(255,255,255,0.3)',
						}}>
						{preset.rootfs} · {preset.vcpu_count} vCPU ·{' '}
						{preset.mem_size_mib} MiB · {preset.timeout_ms / 1000}s
						· ⌘/Ctrl+Enter to run
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

			{/* Execution History */}
			<HistoryPanel />
		</div>
	);
}

function HistoryPanel() {
	const history = useStore(ideService.$history);
	if (history.length === 0) return null;

	return (
		<div style={{ marginTop: '1.5rem' }}>
			<h3
				style={{
					fontSize: '0.95rem',
					fontWeight: 600,
					marginBottom: '0.75rem',
					color: 'var(--sl-color-text, #e6edf3)',
					display: 'flex',
					alignItems: 'center',
					gap: '0.4rem',
				}}>
				<Clock size={16} />
				History
				<span
					style={{
						fontSize: '0.75rem',
						color: 'rgba(255,255,255,0.4)',
						fontWeight: 400,
					}}>
					({history.length})
				</span>
			</h3>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: '0.5rem',
				}}>
				{history.map((entry: HistoryEntry) => {
					const ok =
						entry.result?.exit_code === 0 &&
						entry.result?.status === 'completed';
					const presetLabel =
						PRESETS.find((p) => p.id === entry.preset_id)?.label ??
						entry.preset_id;
					const time = new Date(entry.timestamp).toLocaleTimeString();
					return (
						<div
							key={entry.id + entry.timestamp}
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								padding: '0.5rem 0.75rem',
								background: 'rgba(255,255,255,0.02)',
								border: '1px solid rgba(255,255,255,0.06)',
								borderRadius: '8px',
								fontSize: '0.8rem',
								cursor: 'pointer',
							}}
							onClick={() => {
								ideService.$code.set(entry.code);
							}}
							title="Click to load code">
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '0.5rem',
								}}>
								{ok ? (
									<CheckCircle2
										size={14}
										style={{ color: '#22c55e' }}
									/>
								) : (
									<AlertCircle
										size={14}
										style={{ color: '#ef4444' }}
									/>
								)}
								<span
									style={{
										color: 'rgba(255,255,255,0.6)',
										fontFamily: 'monospace',
										maxWidth: 300,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap',
									}}>
									{entry.code
										.split('\n')
										.find((l) => l.trim()) ?? '(empty)'}
								</span>
							</div>
							<div
								style={{
									display: 'flex',
									gap: '0.75rem',
									color: 'rgba(255,255,255,0.35)',
									fontSize: '0.7rem',
								}}>
								<span>{presetLabel}</span>
								{entry.result && (
									<span>{entry.result.duration_ms}ms</span>
								)}
								<span>{time}</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
