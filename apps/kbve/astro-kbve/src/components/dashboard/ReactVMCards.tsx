import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	vmService,
	phaseColor,
	getCPUCores,
	getMemory,
	getDisks,
	type VMInfo,
} from './vmService';
import {
	Loader2,
	AlertTriangle,
	Play,
	Square,
	RotateCw,
	Cpu,
	MemoryStick,
	HardDrive,
	Monitor,
	Apple,
	Network,
	Bot,
	Clock,
	ShieldAlert,
} from 'lucide-react';

function OSIcon({ osType }: { osType: VMInfo['osType'] }) {
	switch (osType) {
		case 'windows':
			return <Monitor size={20} style={{ color: '#0078D4' }} />;
		case 'macos':
			return <Apple size={20} style={{ color: '#A2AAAD' }} />;
		default:
			return <Monitor size={20} style={{ color: '#f59e0b' }} />;
	}
}

function VMCard({ info }: { info: VMInfo }) {
	const actionInProgress = useStore(vmService.$actionInProgress);
	const { vm, vmi, phase, osType } = info;
	const name = vm.metadata.name;
	const isRunning = phase === 'Running';
	const isStopped = phase === 'Stopped';
	const isTransitioning =
		phase === 'Starting' || phase === 'Stopping' || phase === 'Migrating';
	const currentAction =
		actionInProgress?.split(':')[1] === name
			? actionInProgress.split(':')[0]
			: null;

	const cpuCores = getCPUCores(vm);
	const memory = getMemory(vm);
	const disks = getDisks(vm);

	return (
		<div
			style={{
				borderRadius: 12,
				border: `1px solid ${isRunning ? 'rgba(34, 197, 94, 0.3)' : 'var(--sl-color-gray-5, #30363d)'}`,
				background: 'var(--sl-color-gray-6, #161b22)',
				overflow: 'hidden',
			}}>
			{/* Accent strip */}
			<div style={{ height: 3, background: phaseColor(phase) }} />

			{/* Header */}
			<div style={{ padding: '1rem 1.25rem 0.75rem' }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						marginBottom: 8,
					}}>
					<div
						style={{
							width: 40,
							height: 40,
							borderRadius: 10,
							background: `${phaseColor(phase)}15`,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
						}}>
						<OSIcon osType={osType} />
					</div>
					<div style={{ flex: 1 }}>
						<div
							style={{
								color: 'var(--sl-color-text, #e6edf3)',
								fontWeight: 600,
								fontSize: '0.95rem',
							}}>
							{name}
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							}}>
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 4,
									padding: '1px 6px',
									borderRadius: 4,
									fontSize: '0.65rem',
									fontWeight: 600,
									textTransform: 'uppercase',
									background: `${phaseColor(phase)}18`,
									border: `1px solid ${phaseColor(phase)}30`,
									color: phaseColor(phase),
								}}>
								<span
									style={{
										width: 6,
										height: 6,
										borderRadius: '50%',
										background: phaseColor(phase),
										boxShadow: isRunning
											? `0 0 6px ${phaseColor(phase)}`
											: 'none',
									}}
								/>
								{phase}
							</span>
							<span
								style={{
									fontSize: '0.65rem',
									color: 'var(--sl-color-gray-3, #8b949e)',
									textTransform: 'capitalize',
								}}>
								{osType}
							</span>
						</div>
					</div>
				</div>

				{/* Specs */}
				<div
					style={{
						display: 'flex',
						gap: '1rem',
						flexWrap: 'wrap',
						marginBottom: 10,
					}}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							fontSize: '0.75rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						<Cpu size={12} style={{ color: '#06b6d4' }} />
						{cpuCores} cores
					</div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 4,
							fontSize: '0.75rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
						}}>
						<MemoryStick size={12} style={{ color: '#8b5cf6' }} />
						{memory}
					</div>
					{vmi?.status?.nodeName && (
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 4,
								fontSize: '0.75rem',
								color: 'var(--sl-color-gray-3, #8b949e)',
							}}>
							<Network size={12} style={{ color: '#22c55e' }} />
							{vmi.status.nodeName}
						</div>
					)}
				</div>

				{/* Disks */}
				{disks.length > 0 && (
					<div style={{ marginBottom: 10 }}>
						{disks.map((d) => (
							<div
								key={d.name}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 4,
									fontSize: '0.7rem',
									color: 'var(--sl-color-gray-3, #8b949e)',
									marginBottom: 2,
								}}>
								<HardDrive size={10} />
								<span
									style={{
										color: 'var(--sl-color-text, #e6edf3)',
										fontWeight: 500,
									}}>
									{d.name}
								</span>
								<span style={{ opacity: 0.6 }}>({d.type})</span>
								{d.source && (
									<span style={{ opacity: 0.5 }}>
										{d.source}
									</span>
								)}
							</div>
						))}
					</div>
				)}

				{/* VMI network info */}
				{vmi?.status?.interfaces &&
					vmi.status.interfaces.length > 0 && (
						<div style={{ marginBottom: 10 }}>
							{vmi.status.interfaces.map(
								(iface, idx) =>
									iface.ipAddress && (
										<div
											key={idx}
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 4,
												fontSize: '0.7rem',
												color: 'var(--sl-color-gray-3, #8b949e)',
											}}>
											<Network size={10} />
											<span
												style={{
													fontFamily: 'monospace',
													color: '#06b6d4',
												}}>
												{iface.ipAddress}
											</span>
											{iface.mac && (
												<span style={{ opacity: 0.5 }}>
													({iface.mac})
												</span>
											)}
										</div>
									),
							)}
						</div>
					)}

				{/* Guest OS info */}
				{vmi?.status?.guestOSInfo?.prettyName && (
					<div
						style={{
							fontSize: '0.7rem',
							color: 'var(--sl-color-gray-3, #8b949e)',
							marginBottom: 10,
							fontStyle: 'italic',
						}}>
						{vmi.status.guestOSInfo.prettyName}
					</div>
				)}

				{/* KEDA runner banner */}
				{info.isKedaManaged && isRunning && (
					<div
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							gap: 8,
							padding: '0.5rem 0.75rem',
							borderRadius: 8,
							fontSize: '0.7rem',
							lineHeight: 1.4,
							marginBottom: 10,
							...(info.mayHaveActiveJob
								? {
										background: 'rgba(245, 158, 11, 0.1)',
										border: '1px solid rgba(245, 158, 11, 0.3)',
										color: '#f59e0b',
									}
								: {
										background: 'rgba(6, 182, 212, 0.08)',
										border: '1px solid rgba(6, 182, 212, 0.2)',
										color: '#06b6d4',
									}),
						}}>
						{info.mayHaveActiveJob ? (
							<ShieldAlert
								size={14}
								style={{ flexShrink: 0, marginTop: 1 }}
							/>
						) : (
							<Bot
								size={14}
								style={{ flexShrink: 0, marginTop: 1 }}
							/>
						)}
						<div>
							<div style={{ fontWeight: 600 }}>
								{info.mayHaveActiveJob
									? 'Possible active CI job'
									: 'KEDA auto-managed'}
							</div>
							<div style={{ opacity: 0.85 }}>
								{info.runnerLabel && (
									<span>
										Runner:{' '}
										<code style={{ fontSize: '0.65rem' }}>
											{info.runnerLabel}
										</code>{' '}
										·{' '}
									</span>
								)}
								{info.uptimeMinutes !== undefined && (
									<span>
										<Clock
											size={10}
											style={{
												display: 'inline',
												verticalAlign: 'middle',
											}}
										/>{' '}
										Up {info.uptimeMinutes}m
									</span>
								)}
								{info.mayHaveActiveJob && (
									<span>
										{' '}
										· Stopping may kill an in-progress build
									</span>
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Actions */}
			<div
				style={{
					padding: '0.6rem 1.25rem',
					borderTop: '1px solid var(--sl-color-gray-5, #30363d)',
					display: 'flex',
					gap: 6,
				}}>
				{isStopped && (
					<ActionButton
						icon={<Play size={13} />}
						label="Start"
						color="#22c55e"
						loading={currentAction === 'start'}
						disabled={!!currentAction}
						onClick={() => vmService.startVM(name)}
					/>
				)}
				{isRunning && (
					<>
						<ActionButton
							icon={<Square size={13} />}
							label="Stop"
							color="#ef4444"
							loading={currentAction === 'stop'}
							disabled={!!currentAction}
							onClick={() => {
								if (info.mayHaveActiveJob) {
									const ok = window.confirm(
										`⚠️ ${name} may be running a GitHub Actions build job (uptime: ${info.uptimeMinutes}m, runner: ${info.runnerLabel ?? 'unknown'}).\n\nStopping this VM will kill any in-progress CI jobs.\n\nAre you sure?`,
									);
									if (!ok) return;
								}
								vmService.stopVM(name);
							}}
						/>
						<ActionButton
							icon={<RotateCw size={13} />}
							label="Restart"
							color="#f59e0b"
							loading={currentAction === 'restart'}
							disabled={!!currentAction}
							onClick={() => {
								if (info.mayHaveActiveJob) {
									const ok = window.confirm(
										`⚠️ ${name} may be running a GitHub Actions build job.\n\nRestarting will kill any in-progress CI jobs.\n\nAre you sure?`,
									);
									if (!ok) return;
								}
								vmService.restartVM(name);
							}}
						/>
						<ActionButton
							icon={<Monitor size={13} />}
							label="VNC"
							color="#06b6d4"
							loading={false}
							disabled={false}
							onClick={() => vmService.openVNC(name)}
						/>
					</>
				)}
				{isTransitioning && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							fontSize: '0.75rem',
							color: phaseColor(phase),
						}}>
						<Loader2
							size={14}
							style={{ animation: 'spin 1s linear infinite' }}
						/>
						{phase}...
					</div>
				)}
			</div>
		</div>
	);
}

function ActionButton({
	icon,
	label,
	color,
	loading,
	disabled,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	color: string;
	loading: boolean;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			disabled={disabled || loading}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 4,
				padding: '0.3rem 0.6rem',
				borderRadius: 6,
				border: `1px solid ${color}30`,
				background: `${color}10`,
				color,
				cursor: disabled ? 'not-allowed' : 'pointer',
				opacity: disabled ? 0.5 : 1,
				fontSize: '0.75rem',
				fontWeight: 500,
				transition: 'opacity 0.15s',
			}}>
			{loading ? (
				<Loader2
					size={13}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
			) : (
				icon
			)}
			{label}
		</button>
	);
}

export default function ReactVMCards() {
	const vmInfos = useStore(vmService.$vmInfos);
	const loading = useStore(vmService.$loading);
	const error = useStore(vmService.$error);

	useEffect(() => {
		vmService.loadCacheAndFetch();
	}, []);

	if (loading && vmInfos.length === 0) {
		return (
			<div
				className="not-content"
				style={{
					display: 'flex',
					justifyContent: 'center',
					padding: '2rem',
				}}>
				<Loader2
					size={24}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}
				/>
			</div>
		);
	}

	return (
		<div className="not-content">
			{error && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
						padding: '0.75rem 1rem',
						borderRadius: 8,
						background: 'rgba(239, 68, 68, 0.1)',
						border: '1px solid rgba(239, 68, 68, 0.3)',
						marginBottom: '1rem',
						fontSize: '0.85rem',
						color: '#ef4444',
					}}>
					<AlertTriangle size={16} />
					{error}
				</div>
			)}
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						'repeat(auto-fill, minmax(360px, 1fr))',
					gap: '1rem',
				}}>
				{vmInfos.map((info) => (
					<VMCard key={info.vm.metadata.name} info={info} />
				))}
			</div>
			{vmInfos.length === 0 && !loading && (
				<div
					style={{
						textAlign: 'center',
						padding: '3rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.9rem',
					}}>
					No virtual machines found in the angelscript namespace.
				</div>
			)}
		</div>
	);
}
