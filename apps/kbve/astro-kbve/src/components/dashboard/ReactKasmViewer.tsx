import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { vmService } from './vmService';
import { kasmService, KasmState } from './kasmService';

/** Extract workspace name from URL query parameter.
 *  e.g. /dashboard/vm/kasm/?workspace=kasm-vpn → "kasm-vpn"
 */
function getWorkspaceName(): string | null {
	const params = new URLSearchParams(window.location.search);
	return params.get('workspace');
}

export default function ReactKasmViewer() {
	const token = useStore(vmService.$accessToken);
	const workspaces = useStore(kasmService.$workspaces);
	const loading = useStore(kasmService.$loading);
	const [workspaceName] = useState(() => getWorkspaceName());
	const [launchError, setLaunchError] = useState<string | null>(null);
	const [launchReady, setLaunchReady] = useState(false);
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const [vncStatus, setVncStatus] = useState<{
		text: string;
		level: 'normal' | 'warn' | 'error';
	} | null>(null);

	// Fetch KASM workspaces on mount
	useEffect(() => {
		if (token) {
			kasmService.fetchData(token);
		}
	}, [token]);

	const workspace = useMemo(
		() => workspaces.find((w) => w.workspace.name === workspaceName),
		[workspaces, workspaceName],
	);

	const canConnect = workspace
		? (workspace.state & KasmState.CAN_CONNECT) !== 0
		: false;

	const proxyUrl = useMemo(() => {
		if (!workspaceName || !token) return null;
		return `/dashboard/kasm/launch?access_token=${encodeURIComponent(token)}`;
	}, [workspaceName, token]);

	// The iframe is same-origin (allow-same-origin sandbox + /dashboard path),
	// so we can read noVNC's status DOM directly and mirror it in the outer
	// React shell. Surfaces "Connecting", "Disconnected: …", and the close
	// reason text the backend bridge plants on upstream failure — otherwise
	// those errors are buried in the iframe's overlay where users miss them.
	useEffect(() => {
		if (!launchReady) return;

		let observer: MutationObserver | null = null;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		let cancelled = false;

		const STATUS_SELECTORS = [
			'#noVNC_status',
			'#noVNC_alert',
			'.noVNC_status',
		];

		const readStatus = (root: Document): HTMLElement | null => {
			for (const sel of STATUS_SELECTORS) {
				const el = root.querySelector(sel) as HTMLElement | null;
				if (el) return el;
			}
			return null;
		};

		const classifyLevel = (
			el: HTMLElement,
		): 'normal' | 'warn' | 'error' => {
			const cls = el.className.toLowerCase();
			if (cls.includes('error')) return 'error';
			if (cls.includes('warn')) return 'warn';
			return 'normal';
		};

		const attach = () => {
			if (cancelled) return true;
			const iframe = iframeRef.current;
			let doc: Document | null = null;
			try {
				doc = iframe?.contentDocument ?? null;
			} catch {
				doc = null;
			}
			if (!doc) return false;

			const node = readStatus(doc);
			if (!node) return false;

			const update = () => {
				const text = node.textContent?.trim() ?? '';
				if (!text) {
					setVncStatus(null);
					return;
				}
				setVncStatus({ text, level: classifyLevel(node) });
			};

			update();
			observer = new MutationObserver(update);
			observer.observe(node, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: ['class'],
			});
			return true;
		};

		if (!attach()) {
			pollTimer = setInterval(() => {
				if (attach() && pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
			}, 500);
		}

		return () => {
			cancelled = true;
			observer?.disconnect();
			if (pollTimer) clearInterval(pollTimer);
			setVncStatus(null);
		};
	}, [launchReady]);

	// Probe the launch endpoint before mounting the iframe so axum errors
	// (kasm-vnc-pw missing, K8s API down, JWT expired) surface in the React
	// UI instead of disappearing inside an iframe that just renders the
	// raw JSON. opaqueredirect means the 302 fired and Set-Cookie applied;
	// any readable status is a real error response we can show.
	useEffect(() => {
		if (!proxyUrl || !canConnect) return;
		let cancelled = false;
		setLaunchError(null);
		setLaunchReady(false);
		fetch(proxyUrl, { redirect: 'manual', credentials: 'same-origin' })
			.then(async (res) => {
				if (cancelled) return;
				if (res.type === 'opaqueredirect') {
					setLaunchReady(true);
					return;
				}
				const body = await res.text().catch(() => '');
				let detail = body.slice(0, 400);
				try {
					const j = JSON.parse(body);
					detail = j.error ?? detail;
				} catch {}
				setLaunchError(`Launch failed (${res.status}): ${detail}`);
			})
			.catch((e) => {
				if (!cancelled) setLaunchError(`Network error: ${e}`);
			});
		return () => {
			cancelled = true;
		};
	}, [proxyUrl, canConnect]);

	// --- No workspace name in URL ---
	if (!workspaceName) {
		return (
			<div style={containerStyle}>
				<div style={headerStyle}>
					<a href="/dashboard/vm/" style={backLinkStyle}>
						&larr; Back to VM Dashboard
					</a>
					<h2 style={titleStyle}>KASM Workspace</h2>
				</div>
				<div style={messageStyle}>
					<p>No workspace specified in URL.</p>
					<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
						Navigate to a workspace from the{' '}
						<a href="/dashboard/vm/" style={{ color: '#8b5cf6' }}>
							VM Dashboard
						</a>
						.
					</p>
				</div>
			</div>
		);
	}

	// --- Loading ---
	if (loading) {
		return (
			<div style={containerStyle}>
				<div style={headerStyle}>
					<a href="/dashboard/vm/" style={backLinkStyle}>
						&larr; Back to VM Dashboard
					</a>
					<h2 style={titleStyle}>{workspaceName}</h2>
				</div>
				<div style={messageStyle}>
					<p>Loading workspace...</p>
				</div>
			</div>
		);
	}

	// --- Workspace not found or not connectable ---
	if (!workspace || !canConnect || !proxyUrl) {
		return (
			<div style={containerStyle}>
				<div style={headerStyle}>
					<a href="/dashboard/vm/" style={backLinkStyle}>
						&larr; Back to VM Dashboard
					</a>
					<h2 style={titleStyle}>{workspaceName}</h2>
				</div>
				<div style={messageStyle}>
					{!workspace ? (
						<p>
							Workspace <strong>{workspaceName}</strong> not
							found.
						</p>
					) : (
						<p>
							Workspace <strong>{workspaceName}</strong> is not
							running. Start it from the{' '}
							<a
								href="/dashboard/vm/"
								style={{ color: '#8b5cf6' }}>
								VM Dashboard
							</a>
							.
						</p>
					)}
				</div>
			</div>
		);
	}

	// --- Launch probe failed: surface backend error before mounting iframe ---
	if (launchError) {
		return (
			<div style={containerStyle}>
				<div style={headerStyle}>
					<a href="/dashboard/vm/" style={backLinkStyle}>
						&larr; Back to VM Dashboard
					</a>
					<h2 style={titleStyle}>{workspaceName}</h2>
				</div>
				<div style={messageStyle}>
					<p style={{ color: '#ef4444', fontWeight: 600 }}>
						Workspace failed to launch
					</p>
					<pre
						style={{
							maxWidth: '40rem',
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-word',
							padding: '0.75rem',
							background: 'rgba(239, 68, 68, 0.08)',
							border: '1px solid rgba(239, 68, 68, 0.25)',
							borderRadius: '6px',
							color: '#fca5a5',
							fontSize: '0.8rem',
							textAlign: 'left',
						}}>
						{launchError}
					</pre>
					<p style={{ fontSize: '0.85rem', opacity: 0.7 }}>
						Try restarting the workspace from the{' '}
						<a href="/dashboard/vm/" style={{ color: '#8b5cf6' }}>
							VM Dashboard
						</a>
						.
					</p>
				</div>
			</div>
		);
	}

	// --- Probing launch ---
	if (!launchReady) {
		return (
			<div style={containerStyle}>
				<div style={headerStyle}>
					<a href="/dashboard/vm/" style={backLinkStyle}>
						&larr; Back to VM Dashboard
					</a>
					<h2 style={titleStyle}>{workspaceName}</h2>
				</div>
				<div style={messageStyle}>
					<p>Connecting to workspace...</p>
				</div>
			</div>
		);
	}

	// --- Connected: show iframe ---
	const statusColor =
		vncStatus?.level === 'error'
			? '#ef4444'
			: vncStatus?.level === 'warn'
				? '#f59e0b'
				: '#22c55e';

	return (
		<div style={containerStyle}>
			<div style={headerStyle}>
				<a href="/dashboard/vm/" style={backLinkStyle}>
					&larr; Back
				</a>
				<h2 style={titleStyle}>
					{workspaceName}
					<span style={statusBadgeStyle}>
						{workspace.workspace.image}
					</span>
					{vncStatus && (
						<span
							title={vncStatus.text}
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: '0.35rem',
								fontSize: '0.75rem',
								fontWeight: 500,
								padding: '0.15rem 0.55rem',
								borderRadius: '999px',
								background: `${statusColor}22`,
								border: `1px solid ${statusColor}55`,
								color: statusColor,
								maxWidth: '24rem',
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
							}}>
							<span
								style={{
									width: 6,
									height: 6,
									borderRadius: '50%',
									background: statusColor,
								}}
							/>
							{vncStatus.text}
						</span>
					)}
				</h2>
			</div>
			<div style={iframeWrapperStyle}>
				<iframe
					ref={iframeRef}
					src={proxyUrl}
					title={`KASM Workspace: ${workspaceName}`}
					style={iframeStyle}
					allow="clipboard-read; clipboard-write; autoplay; fullscreen"
					sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	height: 'calc(100vh - 4rem)',
	gap: '0.5rem',
};

const headerStyle: React.CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: '1rem',
	padding: '0.5rem 0',
	flexShrink: 0,
};

const backLinkStyle: React.CSSProperties = {
	color: '#8b5cf6',
	textDecoration: 'none',
	fontSize: '0.85rem',
	whiteSpace: 'nowrap',
};

const titleStyle: React.CSSProperties = {
	margin: 0,
	fontSize: '1.1rem',
	fontWeight: 600,
	display: 'flex',
	alignItems: 'center',
	gap: '0.75rem',
};

const statusBadgeStyle: React.CSSProperties = {
	fontSize: '0.7rem',
	fontWeight: 400,
	background: '#8b5cf622',
	border: '1px solid #8b5cf644',
	borderRadius: '4px',
	padding: '0.15rem 0.5rem',
	color: '#8b5cf6',
};

const messageStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	flex: 1,
	opacity: 0.8,
	textAlign: 'center',
};

const iframeWrapperStyle: React.CSSProperties = {
	flex: 1,
	borderRadius: '8px',
	overflow: 'hidden',
	border: '1px solid #30363d',
	background: '#0d1117',
};

const iframeStyle: React.CSSProperties = {
	width: '100%',
	height: '100%',
	border: 'none',
	display: 'block',
};
