import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { firecrackerService, type FirecrackerInfo } from './firecrackerService';
import { vmService } from './vmService';
import { Flame, Trash2, Cpu, HardDrive, Loader2, Activity } from 'lucide-react';

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

function FirecrackerCard({ info }: { info: FirecrackerInfo }) {
	const actionInProgress = useStore(firecrackerService.$actionInProgress);
	const lastAction = useStore(firecrackerService.$lastAction);
	const token = useStore(vmService.$accessToken);
	const { vm, phase } = info;

	const isActing = actionInProgress?.includes(vm.vm_id) ?? false;
	const cardAction = lastAction?.vm_id === vm.vm_id ? lastAction : null;
	const canDestroy = phase === 'Running' || phase === 'Creating';
	const color = phaseColor(phase);
	const shortId = vm.vm_id.slice(0, 15);

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
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Trash2 size={14} />
						)}
						Destroy
					</button>
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
