import { useState, useEffect, useCallback } from 'react';
import {
	Trash2,
	HardDrive,
	Cpu,
	Wifi,
	Battery,
	Monitor,
	RefreshCw,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Loader2,
	Smartphone,
	Globe,
	Zap,
	Database,
	MemoryStick,
} from 'lucide-react';

type HealthStatus = 'ok' | 'unavailable' | 'checking' | 'error';

interface WorkerCheck {
	label: string;
	status: HealthStatus;
	detail?: string;
}

interface DeviceInfo {
	label: string;
	value: string;
	icon: React.ReactNode;
}

interface StorageEstimate {
	usage: string;
	quota: string;
	percent: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function StatusIcon({ status }: { status: HealthStatus }) {
	switch (status) {
		case 'ok':
			return <CheckCircle2 size={16} style={{ color: '#22c55e' }} />;
		case 'unavailable':
			return <XCircle size={16} style={{ color: '#94a3b8' }} />;
		case 'error':
			return <AlertTriangle size={16} style={{ color: '#ef4444' }} />;
		case 'checking':
			return (
				<Loader2
					size={16}
					style={{
						color: '#3b82f6',
						animation: 'spin 1s linear infinite',
					}}
				/>
			);
	}
}

function statusLabel(status: HealthStatus): string {
	switch (status) {
		case 'ok':
			return 'Available';
		case 'unavailable':
			return 'Not Available';
		case 'error':
			return 'Error';
		case 'checking':
			return 'Checking...';
	}
}

// ---------------------------------------------------------------------------
// Section: Storage Management
// ---------------------------------------------------------------------------

function StorageSection() {
	const [clearing, setClearing] = useState(false);
	const [cleared, setCleared] = useState(false);
	const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
	const [lsCount, setLsCount] = useState(0);

	const refreshStats = useCallback(() => {
		try {
			setLsCount(localStorage.length);
		} catch {
			setLsCount(0);
		}

		if (navigator.storage?.estimate) {
			navigator.storage.estimate().then((est) => {
				setEstimate({
					usage: formatBytes(est.usage ?? 0),
					quota: formatBytes(est.quota ?? 0),
					percent:
						est.quota && est.quota > 0
							? Math.round(((est.usage ?? 0) / est.quota) * 100)
							: 0,
				});
			});
		}
	}, []);

	useEffect(() => {
		refreshStats();
	}, [refreshStats]);

	const handleClear = useCallback(async () => {
		if (
			!window.confirm(
				'This will clear all local data including cached sessions. You may need to log in again. Continue?',
			)
		) {
			return;
		}

		setClearing(true);
		setCleared(false);

		try {
			localStorage.clear();

			const dbs = await window.indexedDB.databases?.();
			if (dbs) {
				for (const db of dbs) {
					if (db.name) {
						window.indexedDB.deleteDatabase(db.name);
					}
				}
			} else {
				for (const name of ['sb-auth-v2', 'sb-auth']) {
					window.indexedDB.deleteDatabase(name);
				}
			}

			if ('caches' in window) {
				const keys = await caches.keys();
				for (const key of keys) {
					await caches.delete(key);
				}
			}

			setCleared(true);
			refreshStats();
		} catch (err) {
			console.error('[Settings] Clear storage error:', err);
		} finally {
			setClearing(false);
		}
	}, [refreshStats]);

	return (
		<div style={cardStyle}>
			<div style={cardHeaderStyle}>
				<Database size={20} />
				<h3 style={headingStyle}>Storage Management</h3>
			</div>

			<div style={statsGridStyle}>
				<div style={statBoxStyle}>
					<span style={statLabelStyle}>localStorage Keys</span>
					<span style={statValueStyle}>{lsCount}</span>
				</div>
				{estimate && (
					<>
						<div style={statBoxStyle}>
							<span style={statLabelStyle}>IndexedDB Usage</span>
							<span style={statValueStyle}>{estimate.usage}</span>
						</div>
						<div style={statBoxStyle}>
							<span style={statLabelStyle}>Storage Quota</span>
							<span style={statValueStyle}>{estimate.quota}</span>
						</div>
						<div style={statBoxStyle}>
							<span style={statLabelStyle}>Used</span>
							<span style={statValueStyle}>
								{estimate.percent}%
							</span>
						</div>
					</>
				)}
			</div>

			{estimate && estimate.percent > 0 && (
				<div style={progressBarBgStyle}>
					<div
						style={{
							...progressBarFillStyle,
							width: `${Math.min(estimate.percent, 100)}%`,
							background:
								estimate.percent > 80
									? '#ef4444'
									: estimate.percent > 50
										? '#f59e0b'
										: '#22c55e',
						}}
					/>
				</div>
			)}

			<div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
				<button
					onClick={handleClear}
					disabled={clearing}
					style={dangerButtonStyle}>
					{clearing ? (
						<Loader2
							size={14}
							style={{ animation: 'spin 1s linear infinite' }}
						/>
					) : (
						<Trash2 size={14} />
					)}
					{clearing ? 'Clearing...' : 'Clear All Data'}
				</button>
				<button onClick={refreshStats} style={secondaryButtonStyle}>
					<RefreshCw size={14} />
					Refresh
				</button>
			</div>

			{cleared && (
				<p style={successMsgStyle}>
					All local data cleared. Reload the page for a fresh start.
				</p>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Section: System Health
// ---------------------------------------------------------------------------

function SystemHealthSection() {
	const [checks, setChecks] = useState<WorkerCheck[]>([]);
	const [running, setRunning] = useState(false);

	const runChecks = useCallback(async () => {
		setRunning(true);
		const results: WorkerCheck[] = [];

		// Web Workers
		results.push({
			label: 'Web Workers',
			status: typeof Worker !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof Worker !== 'undefined'
					? 'Dedicated workers supported'
					: 'Not supported in this browser',
		});

		// SharedWorker
		results.push({
			label: 'Shared Workers',
			status: typeof SharedWorker !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof SharedWorker !== 'undefined'
					? 'Shared workers supported'
					: 'Not supported (Safari, some mobile)',
		});

		// Service Worker
		results.push({
			label: 'Service Workers',
			status: 'serviceWorker' in navigator ? 'ok' : 'unavailable',
			detail:
				'serviceWorker' in navigator
					? 'Service workers supported'
					: 'Not supported',
		});

		// WebGPU
		const gpu = (navigator as any).gpu;
		if (gpu) {
			try {
				const adapter = await gpu.requestAdapter();
				if (adapter) {
					const info = await adapter.requestAdapterInfo?.();
					results.push({
						label: 'WebGPU',
						status: 'ok',
						detail:
							info?.description ||
							info?.vendor ||
							'Adapter available',
					});
				} else {
					results.push({
						label: 'WebGPU',
						status: 'error',
						detail: 'No adapter found',
					});
				}
			} catch {
				results.push({
					label: 'WebGPU',
					status: 'error',
					detail: 'Failed to request adapter',
				});
			}
		} else {
			results.push({
				label: 'WebGPU',
				status: 'unavailable',
				detail: 'Not supported in this browser',
			});
		}

		// WebGL
		try {
			const canvas = document.createElement('canvas');
			const gl =
				canvas.getContext('webgl2') || canvas.getContext('webgl');
			if (gl) {
				const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
				const renderer = debugInfo
					? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
					: 'Available';
				results.push({
					label: 'WebGL',
					status: 'ok',
					detail: String(renderer),
				});
			} else {
				results.push({
					label: 'WebGL',
					status: 'unavailable',
					detail: 'No WebGL context',
				});
			}
		} catch {
			results.push({
				label: 'WebGL',
				status: 'error',
				detail: 'Failed to create context',
			});
		}

		// IndexedDB
		results.push({
			label: 'IndexedDB',
			status: typeof indexedDB !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof indexedDB !== 'undefined'
					? 'Available'
					: 'Not supported',
		});

		// WebSocket
		results.push({
			label: 'WebSocket',
			status: typeof WebSocket !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof WebSocket !== 'undefined'
					? 'Available'
					: 'Not supported',
		});

		// BroadcastChannel
		results.push({
			label: 'BroadcastChannel',
			status:
				typeof BroadcastChannel !== 'undefined' ? 'ok' : 'unavailable',
			detail:
				typeof BroadcastChannel !== 'undefined'
					? 'Available'
					: 'Not supported',
		});

		setChecks(results);
		setRunning(false);
	}, []);

	useEffect(() => {
		runChecks();
	}, [runChecks]);

	const okCount = checks.filter((c) => c.status === 'ok').length;

	return (
		<div style={cardStyle}>
			<div style={cardHeaderStyle}>
				<Cpu size={20} />
				<h3 style={headingStyle}>System Health</h3>
				{checks.length > 0 && (
					<span style={badgeStyle}>
						{okCount}/{checks.length} available
					</span>
				)}
			</div>

			<div style={checkListStyle}>
				{checks.map((check) => (
					<div key={check.label} style={checkRowStyle}>
						<StatusIcon status={check.status} />
						<span style={checkLabelStyle}>{check.label}</span>
						<span style={checkStatusStyle}>
							{statusLabel(check.status)}
						</span>
						{check.detail && (
							<span style={checkDetailStyle}>{check.detail}</span>
						)}
					</div>
				))}
			</div>

			<button
				onClick={runChecks}
				disabled={running}
				style={secondaryButtonStyle}>
				<RefreshCw
					size={14}
					style={
						running ? { animation: 'spin 1s linear infinite' } : {}
					}
				/>
				{running ? 'Checking...' : 'Re-check'}
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Section: Device Info
// ---------------------------------------------------------------------------

function DeviceInfoSection() {
	const [infos, setInfos] = useState<DeviceInfo[]>([]);
	const [batteryInfo, setBatteryInfo] = useState<string | null>(null);

	useEffect(() => {
		const items: DeviceInfo[] = [];

		items.push({
			label: 'Browser',
			value:
				navigator.userAgent.split(/[()]/)[1] ||
				navigator.userAgent.slice(0, 60),
			icon: <Globe size={16} />,
		});

		items.push({
			label: 'Platform',
			value: navigator.platform || 'Unknown',
			icon: <Monitor size={16} />,
		});

		items.push({
			label: 'Language',
			value: navigator.language,
			icon: <Globe size={16} />,
		});

		items.push({
			label: 'Logical Cores',
			value: navigator.hardwareConcurrency
				? String(navigator.hardwareConcurrency)
				: 'Unknown',
			icon: <Cpu size={16} />,
		});

		items.push({
			label: 'Device Memory',
			value: (navigator as any).deviceMemory
				? `${(navigator as any).deviceMemory} GB`
				: 'Unknown',
			icon: <MemoryStick size={16} />,
		});

		items.push({
			label: 'Screen',
			value: `${screen.width}x${screen.height} @ ${window.devicePixelRatio}x`,
			icon: <Monitor size={16} />,
		});

		items.push({
			label: 'Connection',
			value: (navigator as any).connection?.effectiveType || 'Unknown',
			icon: <Wifi size={16} />,
		});

		items.push({
			label: 'Online',
			value: navigator.onLine ? 'Yes' : 'No',
			icon: <Wifi size={16} />,
		});

		items.push({
			label: 'Touch',
			value:
				navigator.maxTouchPoints > 0
					? `${navigator.maxTouchPoints} points`
					: 'No',
			icon: <Smartphone size={16} />,
		});

		items.push({
			label: 'Color Scheme',
			value: window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'Dark'
				: 'Light',
			icon: <Monitor size={16} />,
		});

		setInfos(items);

		// Battery API (Chrome/Edge only)
		if ('getBattery' in navigator) {
			(navigator as any)
				.getBattery()
				.then((batt: any) => {
					const level = Math.round(batt.level * 100);
					const charging = batt.charging ? ', Charging' : '';
					setBatteryInfo(`${level}%${charging}`);
				})
				.catch(() => {
					setBatteryInfo('Not available');
				});
		} else {
			setBatteryInfo('API not supported');
		}
	}, []);

	return (
		<div style={cardStyle}>
			<div style={cardHeaderStyle}>
				<Zap size={20} />
				<h3 style={headingStyle}>Device Info</h3>
			</div>

			<div style={infoGridStyle}>
				{infos.map((info) => (
					<div key={info.label} style={infoRowStyle}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.5rem',
								color: 'var(--sl-color-gray-3)',
							}}>
							{info.icon}
							<span style={infoLabelStyle}>{info.label}</span>
						</div>
						<span style={infoValueStyle}>{info.value}</span>
					</div>
				))}
				{batteryInfo && (
					<div style={infoRowStyle}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.5rem',
								color: 'var(--sl-color-gray-3)',
							}}>
							<Battery size={16} />
							<span style={infoLabelStyle}>Battery</span>
						</div>
						<span style={infoValueStyle}>{batteryInfo}</span>
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function ReactSettingsPanel() {
	return (
		<div style={panelStyle}>
			<StorageSection />
			<SystemHealthSection />
			<DeviceInfoSection />
		</div>
	);
}

// ---------------------------------------------------------------------------
// Styles (inline to avoid CSS module / Tailwind dependency mismatch)
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: '1.25rem',
	minHeight: '60vh',
};

const cardStyle: React.CSSProperties = {
	background: 'var(--sl-color-bg-nav)',
	border: '1px solid var(--sl-color-gray-5)',
	borderRadius: '0.75rem',
	padding: '1.25rem',
};

const cardHeaderStyle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: '0.5rem',
	marginBottom: '1rem',
	color: 'var(--sl-color-white)',
};

const headingStyle: React.CSSProperties = {
	margin: 0,
	fontSize: '1.1rem',
	fontWeight: 600,
	color: 'var(--sl-color-white)',
	flex: 1,
};

const statsGridStyle: React.CSSProperties = {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
	gap: '0.75rem',
	marginBottom: '0.75rem',
};

const statBoxStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: '0.25rem',
	padding: '0.5rem 0.75rem',
	borderRadius: '0.5rem',
	background: 'var(--sl-color-bg)',
};

const statLabelStyle: React.CSSProperties = {
	fontSize: '0.7rem',
	textTransform: 'uppercase',
	letterSpacing: '0.05em',
	color: 'var(--sl-color-gray-3)',
};

const statValueStyle: React.CSSProperties = {
	fontSize: '1rem',
	fontWeight: 600,
	color: 'var(--sl-color-white)',
};

const progressBarBgStyle: React.CSSProperties = {
	height: 6,
	borderRadius: 3,
	background: 'var(--sl-color-gray-5)',
	overflow: 'hidden',
};

const progressBarFillStyle: React.CSSProperties = {
	height: '100%',
	borderRadius: 3,
	transition: 'width 0.3s',
};

const dangerButtonStyle: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.35rem',
	padding: '0.5rem 1rem',
	borderRadius: '0.5rem',
	border: '1px solid #ef4444',
	background: 'transparent',
	color: '#ef4444',
	fontSize: '0.8rem',
	fontWeight: 500,
	cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.35rem',
	padding: '0.5rem 1rem',
	borderRadius: '0.5rem',
	border: '1px solid var(--sl-color-gray-4)',
	background: 'transparent',
	color: 'var(--sl-color-gray-2)',
	fontSize: '0.8rem',
	fontWeight: 500,
	cursor: 'pointer',
};

const successMsgStyle: React.CSSProperties = {
	marginTop: '0.75rem',
	padding: '0.5rem 0.75rem',
	borderRadius: '0.5rem',
	background: '#22c55e15',
	color: '#22c55e',
	fontSize: '0.8rem',
};

const badgeStyle: React.CSSProperties = {
	fontSize: '0.7rem',
	padding: '0.15rem 0.5rem',
	borderRadius: '9999px',
	background: 'var(--sl-color-gray-5)',
	color: 'var(--sl-color-gray-2)',
};

const checkListStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: '0.5rem',
	marginBottom: '1rem',
};

const checkRowStyle: React.CSSProperties = {
	display: 'grid',
	gridTemplateColumns: '20px 1fr auto',
	gap: '0.5rem',
	alignItems: 'center',
	padding: '0.4rem 0.5rem',
	borderRadius: '0.375rem',
	background: 'var(--sl-color-bg)',
	fontSize: '0.85rem',
};

const checkLabelStyle: React.CSSProperties = {
	color: 'var(--sl-color-white)',
	fontWeight: 500,
};

const checkStatusStyle: React.CSSProperties = {
	fontSize: '0.75rem',
	color: 'var(--sl-color-gray-3)',
};

const checkDetailStyle: React.CSSProperties = {
	gridColumn: '2 / -1',
	fontSize: '0.7rem',
	color: 'var(--sl-color-gray-4)',
	marginTop: '-0.25rem',
};

const infoGridStyle: React.CSSProperties = {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
	gap: '0.5rem',
};

const infoRowStyle: React.CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	padding: '0.4rem 0.75rem',
	borderRadius: '0.375rem',
	background: 'var(--sl-color-bg)',
	fontSize: '0.85rem',
};

const infoLabelStyle: React.CSSProperties = {
	color: 'var(--sl-color-gray-3)',
	fontSize: '0.8rem',
};

const infoValueStyle: React.CSSProperties = {
	color: 'var(--sl-color-white)',
	fontWeight: 500,
	fontSize: '0.8rem',
	textAlign: 'right',
	maxWidth: '60%',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};
