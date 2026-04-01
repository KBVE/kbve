import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { kasmService, KasmState, type KasmInfo } from './kasmService';
import { vmService } from './vmService';
import {
	Play,
	Square,
	Monitor,
	Shield,
	ShieldOff,
	Loader2,
} from 'lucide-react';

function KasmCard({ info }: { info: KasmInfo }) {
	const actionInProgress = useStore(kasmService.$actionInProgress);
	const token = useStore(vmService.$accessToken);
	const { workspace, phase, state } = info;

	const isActing = actionInProgress?.includes(workspace.name) ?? false;
	const canStart = !!(state & KasmState.CAN_START);
	const canStop = !!(state & KasmState.CAN_STOP);
	const canConnect = !!(state & KasmState.CAN_CONNECT);
	const vpnActive = !!(state & KasmState.VPN_ACTIVE);

	const phaseColor =
		phase === 'Running'
			? '#22c55e'
			: phase === 'Starting'
				? '#f59e0b'
				: phase === 'Error'
					? '#ef4444'
					: '#6b7280';

	const imageName = workspace.image.split('/').pop() ?? workspace.image;

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
					<Monitor size={18} style={{ color: '#a78bfa' }} />
					<span style={{ fontWeight: 600, fontSize: '1rem' }}>
						{workspace.name}
					</span>
				</div>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.35rem',
						fontSize: '0.8rem',
						color: phaseColor,
						fontWeight: 500,
					}}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: phaseColor,
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
				<span>Image: {imageName}</span>
				<span>Port: {workspace.port}</span>
				<span>
					Replicas: {workspace.readyReplicas}/{workspace.replicas}
				</span>
				<span
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.25rem',
					}}>
					VPN:{' '}
					{vpnActive ? (
						<>
							<Shield size={12} style={{ color: '#22c55e' }} />{' '}
							Connected
						</>
					) : (
						<>
							<ShieldOff size={12} style={{ color: '#6b7280' }} />{' '}
							{workspace.vpnStatus}
						</>
					)}
				</span>
			</div>

			{/* Actions */}
			<div
				style={{
					display: 'flex',
					gap: '0.5rem',
					marginTop: '0.25rem',
				}}>
				{canStart && (
					<button
						onClick={() =>
							token &&
							kasmService.startWorkspace(token, workspace.name)
						}
						disabled={isActing}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.3rem',
							padding: '0.35rem 0.75rem',
							background: '#22c55e22',
							border: '1px solid #22c55e44',
							borderRadius: '6px',
							color: '#22c55e',
							fontSize: '0.8rem',
							cursor: isActing ? 'wait' : 'pointer',
						}}>
						{isActing ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Play size={14} />
						)}
						Start
					</button>
				)}
				{canStop && (
					<button
						onClick={() =>
							token &&
							kasmService.stopWorkspace(token, workspace.name)
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
							<Square size={14} />
						)}
						Stop
					</button>
				)}
				{canConnect && (
					<a
						href={`https://${window.location.host}/dashboard/vm/kasm/${workspace.name}`}
						target="_blank"
						rel="noopener noreferrer"
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.3rem',
							padding: '0.35rem 0.75rem',
							background: '#8b5cf622',
							border: '1px solid #8b5cf644',
							borderRadius: '6px',
							color: '#8b5cf6',
							fontSize: '0.8rem',
							textDecoration: 'none',
						}}>
						<Monitor size={14} />
						Open
					</a>
				)}
			</div>
		</div>
	);
}

export default function ReactKasmCards() {
	const workspaces = useStore(kasmService.$workspaces);
	const loading = useStore(kasmService.$loading);
	const error = useStore(kasmService.$error);
	const token = useStore(vmService.$accessToken);

	useEffect(() => {
		if (token) {
			kasmService.fetchData(token);
			kasmService.startAutoRefresh(token);
		}
	}, [token]);

	if (!token) return null;
	if (loading && workspaces.length === 0) return null;

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
				<Monitor size={20} style={{ color: '#a78bfa' }} />
				KASM Workspaces
				{workspaces.length > 0 && (
					<span
						style={{
							fontSize: '0.8rem',
							color: 'rgba(255,255,255,0.5)',
							fontWeight: 400,
						}}>
						(
						{workspaces.filter((w) => w.phase === 'Running').length}
						/{workspaces.length} running)
					</span>
				)}
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

			{workspaces.length === 0 ? (
				<div
					style={{
						padding: '1rem',
						background: 'rgba(255,255,255,0.03)',
						borderRadius: '8px',
						color: 'rgba(255,255,255,0.4)',
						textAlign: 'center',
						fontSize: '0.9rem',
					}}>
					No KASM workspaces found in the cluster
				</div>
			) : (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns:
							'repeat(auto-fill, minmax(340px, 1fr))',
						gap: '1rem',
					}}>
					{workspaces.map((info) => (
						<KasmCard key={info.workspace.name} info={info} />
					))}
				</div>
			)}
		</div>
	);
}
