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
	Cpu,
	MemoryStick,
	MessageCircle,
	Globe,
} from 'lucide-react';

type BundledApp = 'discord' | 'cloakbrowser';

interface ImageMeta {
	display: string;
	projectSlug?: string;
	bundledApps: BundledApp[];
}

const KASM_IMAGE_BUNDLES: Record<
	string,
	{ apps: BundledApp[]; projectSlug?: string }
> = {
	'kasm-void': {
		apps: ['discord', 'cloakbrowser'],
		projectSlug: 'kasm-void',
	},
	'kasm-cloakbrowser': {
		apps: ['cloakbrowser'],
		projectSlug: 'kasm-cloakbrowser',
	},
	discord: { apps: ['discord'] },
	cloakbrowser: { apps: ['cloakbrowser'] },
};

function parseImage(image: string): ImageMeta {
	const lastSlash = image.lastIndexOf('/');
	const tail = lastSlash >= 0 ? image.slice(lastSlash + 1) : image;
	const colonIdx = tail.indexOf(':');
	const name = colonIdx >= 0 ? tail.slice(0, colonIdx) : tail;
	const tag = colonIdx >= 0 ? tail.slice(colonIdx + 1) : 'latest';
	const bundle = KASM_IMAGE_BUNDLES[name];
	return {
		display: `${name}:${tag}`,
		projectSlug: bundle?.projectSlug,
		bundledApps: bundle?.apps ?? [],
	};
}

function AppChip({ app }: { app: BundledApp }) {
	const config: Record<
		BundledApp,
		{ label: string; color: string; Icon: typeof MessageCircle }
	> = {
		discord: {
			label: 'Discord',
			color: '#5865f2',
			Icon: MessageCircle,
		},
		cloakbrowser: {
			label: 'CloakBrowser',
			color: '#a78bfa',
			Icon: Globe,
		},
	};
	const { label, color, Icon } = config[app];
	return (
		<span
			title={`Bundled: ${label}`}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: '0.25rem',
				padding: '0.15rem 0.45rem',
				borderRadius: '999px',
				fontSize: '0.7rem',
				background: `${color}22`,
				border: `1px solid ${color}44`,
				color,
			}}>
			<Icon size={11} />
			{label}
		</span>
	);
}

interface ResourcePillProps {
	label: string;
	value: string;
	color: string;
	Icon: typeof Cpu;
	title: string;
}

function ResourcePill({ label, value, color, Icon, title }: ResourcePillProps) {
	return (
		<span
			title={title}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: '0.3rem',
				padding: '0.2rem 0.55rem',
				borderRadius: '6px',
				fontSize: '0.72rem',
				background: `${color}1a`,
				border: `1px solid ${color}40`,
				color,
			}}>
			<Icon size={11} />
			<span style={{ opacity: 0.7 }}>{label}</span>
			<strong style={{ fontWeight: 600 }}>{value}</strong>
		</span>
	);
}

function formatRange(req?: string, lim?: string): string | null {
	if (!req && !lim) return null;
	if (req && lim && req !== lim) return `${req} → ${lim}`;
	return lim ?? req ?? '';
}

function KasmCard({ info }: { info: KasmInfo }) {
	const actionInProgress = useStore(kasmService.$actionInProgress);
	const lastAction = useStore(kasmService.$lastAction);
	const token = useStore(vmService.$accessToken);
	const { workspace, phase, state } = info;

	const isActing = actionInProgress?.includes(workspace.name) ?? false;
	const cardAction = lastAction?.name === workspace.name ? lastAction : null;
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

	const imageMeta = parseImage(workspace.image);

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
				<span style={{ gridColumn: 'span 2' }}>
					Image:{' '}
					{imageMeta.projectSlug ? (
						<a
							href={`/project/${imageMeta.projectSlug}/`}
							title={workspace.image}
							style={{
								color: '#a78bfa',
								textDecoration: 'none',
								borderBottom: '1px dashed #a78bfa66',
							}}>
							{imageMeta.display}
						</a>
					) : (
						<span title={workspace.image}>{imageMeta.display}</span>
					)}
				</span>
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

			{(() => {
				const cpu = formatRange(
					workspace.resources?.requests?.cpu,
					workspace.resources?.limits?.cpu,
				);
				const mem = formatRange(
					workspace.resources?.requests?.memory,
					workspace.resources?.limits?.memory,
				);
				if (!cpu && !mem) return null;
				return (
					<div
						style={{
							display: 'flex',
							flexWrap: 'wrap',
							gap: '0.4rem',
							marginTop: '-0.25rem',
						}}>
						{cpu && (
							<ResourcePill
								label="CPU"
								value={cpu}
								color="#38bdf8"
								Icon={Cpu}
								title={`requests ${workspace.resources?.requests?.cpu ?? '—'} · limits ${workspace.resources?.limits?.cpu ?? '—'}`}
							/>
						)}
						{mem && (
							<ResourcePill
								label="Memory"
								value={mem}
								color="#f59e0b"
								Icon={MemoryStick}
								title={`requests ${workspace.resources?.requests?.memory ?? '—'} · limits ${workspace.resources?.limits?.memory ?? '—'}`}
							/>
						)}
					</div>
				);
			})()}

			{imageMeta.bundledApps.length > 0 && (
				<div
					style={{
						display: 'flex',
						flexWrap: 'wrap',
						gap: '0.35rem',
						marginTop: '-0.25rem',
					}}>
					{imageMeta.bundledApps.map((app) => (
						<AppChip key={app} app={app} />
					))}
				</div>
			)}

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
						href={`/dashboard/vm/kasm/?workspace=${encodeURIComponent(workspace.name)}`}
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

			{/* Inline action feedback */}
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
