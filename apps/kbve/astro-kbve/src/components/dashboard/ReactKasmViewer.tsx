import { useState, useEffect, useMemo } from 'react';
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

	// Build the proxy URL for the iframe
	const proxyUrl = useMemo(() => {
		if (!workspaceName || !token) return null;
		return `/dashboard/kasm/proxy/?access_token=${encodeURIComponent(token)}`;
	}, [workspaceName, token]);

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

	// --- Connected: show iframe ---
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
				</h2>
			</div>
			<div style={iframeWrapperStyle}>
				<iframe
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
