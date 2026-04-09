import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
	firecrackerService,
	SCRIPT_PRESETS,
	type FirecrackerInfo,
	type VmResult,
} from './firecrackerService';
import { vmService } from './vmService';
import {
	Flame,
	Trash2,
	Cpu,
	HardDrive,
	Loader2,
	Activity,
	Play,
	Terminal,
	FileText,
	Clock,
	ChevronDown,
	ChevronUp,
} from 'lucide-react';

function phaseColor(phase: string): string {
	switch (phase) {
		case 'Running':
			return '#22c55e';
		case 'Creating':
			return '#f59e0b';
		case 'Completed':
			return '#3b82f6';
		case 'Failed':
			return '#ef4444';
		case 'Timeout':
			return '#f97316';
		case 'Destroyed':
			return '#6b7280';
		default:
			return '#6b7280';
	}
}

// ---------------------------------------------------------------------------
// VM Result Viewer — shows stdout/stderr after completion
// ---------------------------------------------------------------------------

function ResultViewer({ result }: { result: VmResult }) {
	const exitColor = result.exit_code === 0 ? '#22c55e' : '#ef4444';

	return (
		<div
			style={{
				marginTop: '0.5rem',
				borderRadius: '8px',
				overflow: 'hidden',
				border: '1px solid rgba(255,255,255,0.08)',
			}}>
			{/* Result header */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.75rem',
					padding: '0.5rem 0.75rem',
					background: 'rgba(255,255,255,0.03)',
					fontSize: '0.75rem',
					color: 'rgba(255,255,255,0.5)',
				}}>
				<span style={{ color: exitColor, fontWeight: 600 }}>
					exit: {result.exit_code ?? '?'}
				</span>
				{result.duration_ms != null && (
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.2rem',
						}}>
						<Clock size={10} />
						{result.duration_ms}ms
					</span>
				)}
			</div>

			{/* stdout */}
			{result.stdout && (
				<div style={{ padding: '0.5rem 0.75rem' }}>
					<div
						style={{
							fontSize: '0.65rem',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							color: 'rgba(255,255,255,0.35)',
							marginBottom: '0.25rem',
						}}>
						stdout
					</div>
					<pre
						style={{
							margin: 0,
							padding: '0.5rem',
							background: 'rgba(0,0,0,0.3)',
							borderRadius: '4px',
							fontSize: '0.75rem',
							color: 'rgba(255,255,255,0.8)',
							overflow: 'auto',
							maxHeight: '200px',
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-all',
						}}>
						{result.stdout}
					</pre>
				</div>
			)}

			{/* stderr */}
			{result.stderr && (
				<div style={{ padding: '0 0.75rem 0.5rem' }}>
					<div
						style={{
							fontSize: '0.65rem',
							textTransform: 'uppercase',
							letterSpacing: '0.05em',
							color: '#ef4444',
							marginBottom: '0.25rem',
						}}>
						stderr
					</div>
					<pre
						style={{
							margin: 0,
							padding: '0.5rem',
							background: 'rgba(239,68,68,0.05)',
							borderRadius: '4px',
							fontSize: '0.75rem',
							color: '#fca5a5',
							overflow: 'auto',
							maxHeight: '120px',
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-all',
						}}>
						{result.stderr}
					</pre>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// FirecrackerCard — individual VM card with result toggle
// ---------------------------------------------------------------------------

function FirecrackerCard({ info }: { info: FirecrackerInfo }) {
	const actionInProgress = useStore(firecrackerService.$actionInProgress);
	const lastAction = useStore(firecrackerService.$lastAction);
	const results = useStore(firecrackerService.$results);
	const token = useStore(vmService.$accessToken);
	const { vm, phase } = info;

	const resultRef = useRef<HTMLDivElement>(null);
	const chevRef = useRef<{ open: boolean }>({ open: false });

	const isActing = actionInProgress?.includes(vm.vm_id) ?? false;
	const cardAction = lastAction?.vm_id === vm.vm_id ? lastAction : null;
	const canDestroy = phase === 'Running' || phase === 'Creating';
	const hasResult =
		phase === 'Completed' || phase === 'Failed' || phase === 'Timeout';
	const result = results[vm.vm_id];
	const color = phaseColor(phase);
	const shortId = vm.vm_id.slice(0, 15);

	const toggleResult = () => {
		if (!token) return;
		if (!result) {
			firecrackerService.fetchResult(token, vm.vm_id);
		}
		const el = resultRef.current;
		if (!el) return;
		const opening = el.style.display === 'none';
		el.style.display = opening ? '' : 'none';
		chevRef.current.open = opening;
	};

	return (
		<div
			style={{
				background: 'rgba(255,255,255,0.03)',
				border: '1px solid rgba(255,255,255,0.08)',
				borderRadius: '12px',
				padding: '1.25rem',
				display: 'flex',
				flexDirection: 'column',
				gap: '0.75rem',
			}}>
			{/* Header */}
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
					}}>
					<Flame size={18} style={{ color: '#f97316' }} />
					<span
						style={{
							fontWeight: 600,
							fontSize: '0.95rem',
							fontFamily: 'monospace',
						}}>
						{shortId}
					</span>
				</div>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.35rem',
						fontSize: '0.8rem',
						color,
						fontWeight: 500,
					}}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: color,
							display: 'inline-block',
						}}
					/>
					{phase}
				</span>
			</div>

			{/* Details */}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr 1fr',
					gap: '0.4rem',
					fontSize: '0.8rem',
					color: 'rgba(255,255,255,0.6)',
				}}>
				<span
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.25rem',
					}}>
					<HardDrive size={12} /> {vm.rootfs}
				</span>
				<span
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.25rem',
					}}>
					<Cpu size={12} /> {vm.vcpu_count} vCPU / {vm.mem_size_mib}{' '}
					MiB
				</span>
			</div>

			{/* Actions */}
			<div
				style={{
					display: 'flex',
					gap: '0.5rem',
					marginTop: '0.25rem',
				}}>
				{canDestroy && (
					<button
						onClick={() =>
							token &&
							firecrackerService.destroyVM(token, vm.vm_id)
						}
						disabled={isActing}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.3rem',
							padding: '0.35rem 0.75rem',
							background: '#ef444422',
							border: '1px solid #ef444444',
							borderRadius: '6px',
							color: '#ef4444',
							fontSize: '0.8rem',
							cursor: isActing ? 'wait' : 'pointer',
						}}>
						{isActing ? (
							<Loader2
								size={14}
								style={{ animation: 'spin 1s linear infinite' }}
							/>
						) : (
							<Trash2 size={14} />
						)}
						Destroy
					</button>
				)}
				{hasResult && (
					<button
						onClick={toggleResult}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.3rem',
							padding: '0.35rem 0.75rem',
							background: '#3b82f622',
							border: '1px solid #3b82f644',
							borderRadius: '6px',
							color: '#3b82f6',
							fontSize: '0.8rem',
							cursor: 'pointer',
						}}>
						<FileText size={14} />
						Result
					</button>
				)}
			</div>

			{/* Result panel (hidden by default, toggled via ref) */}
			<div ref={resultRef} style={{ display: 'none' }}>
				{result ? (
					<ResultViewer result={result} />
				) : (
					<div
						style={{
							padding: '0.75rem',
							textAlign: 'center',
							color: 'rgba(255,255,255,0.4)',
							fontSize: '0.8rem',
						}}>
						<Loader2
							size={14}
							style={{
								animation: 'spin 1s linear infinite',
								display: 'inline-block',
								marginRight: '0.4rem',
							}}
						/>
						Loading result...
					</div>
				)}
			</div>

			{/* Action feedback */}
			{cardAction && (
				<div
					style={{
						padding: '0.4rem 0.75rem',
						borderRadius: '6px',
						fontSize: '0.8rem',
						background: cardAction.ok
							? 'rgba(34, 197, 94, 0.1)'
							: 'rgba(239, 68, 68, 0.1)',
						border: `1px solid ${cardAction.ok ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
						color: cardAction.ok ? '#22c55e' : '#ef4444',
					}}>
					{cardAction.message}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Script Presets Panel
// ---------------------------------------------------------------------------

function ScriptPresetsPanel({ token }: { token: string }) {
	const creating = useStore(firecrackerService.$creating);
	const lastAction = useStore(firecrackerService.$lastAction);
	const panelRef = useRef<HTMLDivElement>(null);
	const chevronRef = useRef<SVGSVGElement>(null);

	const toggle = () => {
		const el = panelRef.current;
		const chev = chevronRef.current;
		if (!el) return;
		const opening = el.style.display === 'none';
		el.style.display = opening ? '' : 'none';
		if (chev) {
			chev.style.transform = opening ? 'rotate(180deg)' : 'rotate(0deg)';
		}
	};

	const newAction = lastAction?.vm_id === 'new' ? lastAction : null;

	return (
		<div
			style={{
				marginBottom: '1rem',
				border: '1px solid rgba(255,255,255,0.08)',
				borderRadius: '12px',
				overflow: 'hidden',
			}}>
			{/* Toggle header */}
			<button
				onClick={toggle}
				style={{
					width: '100%',
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					padding: '0.75rem 1rem',
					background: 'rgba(249, 115, 22, 0.06)',
					border: 'none',
					borderBottom: '1px solid rgba(255,255,255,0.06)',
					color: 'var(--sl-color-text, #e6edf3)',
					cursor: 'pointer',
					fontSize: '0.9rem',
					fontWeight: 600,
					textAlign: 'left',
				}}>
				<Terminal size={16} style={{ color: '#f97316' }} />
				Run Script
				<ChevronDown
					ref={chevronRef}
					size={14}
					style={{
						marginLeft: 'auto',
						color: 'rgba(255,255,255,0.4)',
						transition: 'transform 0.15s ease',
					}}
				/>
			</button>

			{/* Preset grid (hidden by default) */}
			<div ref={panelRef} style={{ display: 'none', padding: '1rem' }}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns:
							'repeat(auto-fill, minmax(240px, 1fr))',
						gap: '0.75rem',
					}}>
					{SCRIPT_PRESETS.map((preset) => (
						<button
							key={preset.name}
							disabled={creating}
							onClick={() =>
								firecrackerService.createVM(token, {
									rootfs: preset.rootfs,
									entrypoint: preset.entrypoint,
									vcpu_count: preset.vcpu_count,
									mem_size_mib: preset.mem_size_mib,
									timeout_ms: preset.timeout_ms,
									env: { CODE: preset.code },
								})
							}
							style={{
								display: 'flex',
								flexDirection: 'column',
								gap: '0.3rem',
								padding: '0.75rem',
								background: 'rgba(255,255,255,0.03)',
								border: '1px solid rgba(255,255,255,0.08)',
								borderRadius: '8px',
								color: 'var(--sl-color-text, #e6edf3)',
								cursor: creating ? 'wait' : 'pointer',
								textAlign: 'left',
								transition: 'border-color 0.15s',
							}}
							onMouseEnter={(e) =>
								(e.currentTarget.style.borderColor =
									'rgba(249, 115, 22, 0.4)')
							}
							onMouseLeave={(e) =>
								(e.currentTarget.style.borderColor =
									'rgba(255,255,255,0.08)')
							}>
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '0.4rem',
									fontSize: '0.85rem',
									fontWeight: 600,
								}}>
								<Play size={14} style={{ color: '#f97316' }} />
								{preset.name}
							</div>
							<div
								style={{
									fontSize: '0.75rem',
									color: 'rgba(255,255,255,0.45)',
								}}>
								{preset.description}
							</div>
							<div
								style={{
									display: 'flex',
									gap: '0.5rem',
									fontSize: '0.7rem',
									color: 'rgba(255,255,255,0.3)',
									marginTop: '0.15rem',
								}}>
								<span>{preset.rootfs}</span>
								<span>
									{preset.vcpu_count} vCPU /{' '}
									{preset.mem_size_mib} MiB
								</span>
								<span>{preset.timeout_ms / 1000}s timeout</span>
							</div>
						</button>
					))}
				</div>

				{/* Creating indicator */}
				{creating && (
					<div
						style={{
							marginTop: '0.75rem',
							padding: '0.5rem 0.75rem',
							borderRadius: '6px',
							background: 'rgba(249, 115, 22, 0.1)',
							border: '1px solid rgba(249, 115, 22, 0.25)',
							color: '#f97316',
							fontSize: '0.8rem',
							display: 'flex',
							alignItems: 'center',
							gap: '0.4rem',
						}}>
						<Loader2
							size={14}
							style={{ animation: 'spin 1s linear infinite' }}
						/>
						Creating microVM...
					</div>
				)}

				{/* Create feedback */}
				{newAction && !creating && (
					<div
						style={{
							marginTop: '0.75rem',
							padding: '0.5rem 0.75rem',
							borderRadius: '6px',
							background: newAction.ok
								? 'rgba(34, 197, 94, 0.1)'
								: 'rgba(239, 68, 68, 0.1)',
							border: `1px solid ${newAction.ok ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
							color: newAction.ok ? '#22c55e' : '#ef4444',
							fontSize: '0.8rem',
						}}>
						{newAction.message}
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ReactFirecrackerCards() {
	const vms = useStore(firecrackerService.$vms);
	const health = useStore(firecrackerService.$health);
	const loading = useStore(firecrackerService.$loading);
	const error = useStore(firecrackerService.$error);
	const token = useStore(vmService.$accessToken);

	useEffect(() => {
		if (token) {
			firecrackerService.fetchData(token);
			firecrackerService.startAutoRefresh(token);
		}
	}, [token]);

	if (!token) return null;
	if (loading && vms.length === 0 && !health) return null;

	const serviceStatus =
		health?.status === 'ok' ? 'Online' : error ? 'Unreachable' : 'Unknown';
	const statusColor =
		serviceStatus === 'Online'
			? '#22c55e'
			: serviceStatus === 'Unreachable'
				? '#ef4444'
				: '#6b7280';

	return (
		<div style={{ marginTop: '2rem' }}>
			<h3
				style={{
					fontSize: '1.1rem',
					fontWeight: 600,
					marginBottom: '1rem',
					color: 'var(--sl-color-text, #e6edf3)',
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
				}}>
				<Flame size={20} style={{ color: '#f97316' }} />
				Firecracker MicroVMs
				<span
					style={{
						fontSize: '0.8rem',
						fontWeight: 400,
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.35rem',
					}}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: statusColor,
							display: 'inline-block',
						}}
					/>
					<span style={{ color: statusColor }}>{serviceStatus}</span>
					{health?.version && (
						<span style={{ color: 'rgba(255,255,255,0.4)' }}>
							v{health.version}
						</span>
					)}
					{vms.length > 0 && (
						<span style={{ color: 'rgba(255,255,255,0.5)' }}>
							({vms.filter((v) => v.phase === 'Running').length}/
							{vms.length} running)
						</span>
					)}
				</span>
			</h3>

			{error && (
				<div
					style={{
						padding: '0.75rem',
						background: '#ef444422',
						border: '1px solid #ef444444',
						borderRadius: '8px',
						color: '#ef4444',
						fontSize: '0.85rem',
						marginBottom: '1rem',
					}}>
					{error}
				</div>
			)}

			{/* Script presets (only when service is online) */}
			{serviceStatus === 'Online' && <ScriptPresetsPanel token={token} />}

			{vms.length === 0 ? (
				<div
					style={{
						padding: '1rem',
						background: 'rgba(255,255,255,0.03)',
						borderRadius: '8px',
						color: 'rgba(255,255,255,0.4)',
						textAlign: 'center',
						fontSize: '0.9rem',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: '0.5rem',
					}}>
					<Activity size={16} />
					{serviceStatus === 'Online'
						? 'No active microVMs'
						: 'Firecracker service not available'}
				</div>
			) : (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns:
							'repeat(auto-fill, minmax(340px, 1fr))',
						gap: '1rem',
					}}>
					{vms.map((info) => (
						<FirecrackerCard key={info.vm.vm_id} info={info} />
					))}
				</div>
			)}
		</div>
	);
}
