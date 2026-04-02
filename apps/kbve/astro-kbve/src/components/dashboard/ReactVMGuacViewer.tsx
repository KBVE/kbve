import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { vmService } from './vmService';
import { X, Maximize2, Minimize2, Keyboard } from 'lucide-react';

// Guacamole client — dynamically imported at runtime.
// The package is externalized in vite config to avoid bundling issues.
// Only loaded when the Guacamole viewer is actually opened.
let Guacamole: any = null;
async function loadGuacamole() {
	if (!Guacamole) {
		try {
			// Try vendored ESM first
			const vendorUrl = `${window.location.origin}/vendor/guacamole/guacamole-common.js`;
			const mod = await import(/* @vite-ignore */ vendorUrl);
			Guacamole = mod.default ?? mod;
		} catch {
			try {
				// Fallback: npm package (dev mode)
				const mod = await import(
					/* @vite-ignore */ 'guacamole-common-js'
				);
				Guacamole = mod.default ?? mod;
			} catch {
				throw new Error(
					'RDP not available — Guacamole server is not deployed. Deploy via ArgoCD (kubevirt-guacamole app).',
				);
			}
		}
	}
	return Guacamole;
}

export default function ReactVMGuacViewer() {
	const guacTarget = useStore(vmService.$guacTarget);
	const clientRef = useRef<any>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const displayRef = useRef<HTMLDivElement>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState('Connecting...');
	const [keyboardVisible, setKeyboardVisible] = useState(false);

	const cleanup = useCallback(() => {
		if (clientRef.current) {
			clientRef.current.disconnect();
			clientRef.current = null;
		}
		setConnected(false);
		setStatus('Disconnected');
	}, []);

	useEffect(() => {
		if (!guacTarget) {
			cleanup();
			return;
		}

		const target = displayRef.current;
		if (!target) return;

		target.innerHTML = '';
		setStatus('Connecting...');

		(async () => {
			try {
				const GuacLib = await loadGuacamole();

				// Build WebSocket tunnel URL to our Guacamole proxy
				const proto =
					window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const tunnelUrl = `${proto}//${window.location.host}/dashboard/guac/proxy/guacamole/websocket-tunnel`;

				const tunnel = new GuacLib.WebSocketTunnel(tunnelUrl);
				const client = new GuacLib.Client(tunnel);

				// Attach display to DOM
				const display = client.getDisplay();
				target.appendChild(display.getElement());

				// Scale display to fit container
				const resizeObserver = new ResizeObserver(() => {
					if (!target || !display) return;
					const width = target.clientWidth;
					const height = target.clientHeight;
					if (width > 0 && height > 0) {
						const scale = Math.min(
							width / display.getWidth(),
							height / display.getHeight(),
						);
						display.scale(scale);
					}
				});
				resizeObserver.observe(target);

				client.onstatechange = (state: number) => {
					switch (state) {
						case 0: // IDLE
							setStatus('Idle');
							setConnected(false);
							break;
						case 1: // CONNECTING
							setStatus('Connecting...');
							break;
						case 2: // WAITING
							setStatus('Waiting for server...');
							break;
						case 3: // CONNECTED
							setStatus(`Connected to ${guacTarget}`);
							setConnected(true);
							break;
						case 4: // DISCONNECTING
							setStatus('Disconnecting...');
							break;
						case 5: // DISCONNECTED
							setStatus('Disconnected');
							setConnected(false);
							break;
					}
				};

				client.onerror = (error: { message?: string }) => {
					setStatus(
						`Error: ${error?.message ?? 'Connection failed'}`,
					);
					setConnected(false);
				};

				// Connect with the connection parameters
				// The token and connection ID are passed as query params
				// Guacamole authenticates via its own session system
				client.connect(
					`token=${encodeURIComponent(guacTarget)}&GUAC_WIDTH=${window.screen.width}&GUAC_HEIGHT=${window.screen.height}&GUAC_DPI=96`,
				);

				clientRef.current = client;

				return () => {
					resizeObserver.disconnect();
				};
			} catch (err) {
				setStatus(
					`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`,
				);
			}
		})();

		return cleanup;
	}, [guacTarget, cleanup]);

	// Ctrl+Alt+Del sender for Windows RDP sessions
	const sendCtrlAltDel = useCallback(() => {
		const client = clientRef.current;
		if (!client) return;
		// Press keys
		client.sendKeyEvent(1, 0xffe3); // Ctrl
		client.sendKeyEvent(1, 0xffe9); // Alt
		client.sendKeyEvent(1, 0xffff); // Delete
		// Release keys
		client.sendKeyEvent(0, 0xffff);
		client.sendKeyEvent(0, 0xffe9);
		client.sendKeyEvent(0, 0xffe3);
	}, []);

	const toggleKeyboard = useCallback(() => {
		setKeyboardVisible(!keyboardVisible);
		// Guacamole has its own keyboard handling via the display element
	}, [keyboardVisible]);

	if (!guacTarget) return null;

	return (
		<div
			ref={containerRef}
			className="not-content"
			style={{
				position: fullscreen ? 'fixed' : 'relative',
				top: fullscreen ? 0 : undefined,
				left: fullscreen ? 0 : undefined,
				right: fullscreen ? 0 : undefined,
				bottom: fullscreen ? 0 : undefined,
				zIndex: fullscreen ? 9999 : 1,
				marginTop: fullscreen ? 0 : '1.5rem',
				borderRadius: fullscreen ? 0 : 12,
				border: '1px solid var(--sl-color-gray-5, #30363d)',
				background: '#0a0a0a',
				overflow: 'hidden',
				display: 'flex',
				flexDirection: 'column',
			}}>
			{/* Toolbar */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '0.5rem 1rem',
					background: 'var(--sl-color-gray-6, #161b22)',
					borderBottom: '1px solid var(--sl-color-gray-5, #30363d)',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 8,
					}}>
					<span
						style={{
							width: 8,
							height: 8,
							borderRadius: '50%',
							background: connected ? '#22c55e' : '#ef4444',
							boxShadow: connected ? '0 0 6px #22c55e' : 'none',
						}}
					/>
					<span
						style={{
							fontSize: '0.75rem',
							padding: '2px 8px',
							borderRadius: 4,
							background: 'rgba(59, 130, 246, 0.15)',
							color: '#60a5fa',
							fontWeight: 500,
						}}>
						RDP
					</span>
					<span
						style={{
							fontSize: '0.8rem',
							color: 'var(--sl-color-text, #e6edf3)',
							fontWeight: 500,
						}}>
						{status}
					</span>
				</div>
				<div style={{ display: 'flex', gap: 4 }}>
					{connected && (
						<>
							<ToolbarButton
								title="Send Ctrl+Alt+Del"
								onClick={sendCtrlAltDel}>
								<span
									style={{
										fontSize: '0.6rem',
										fontWeight: 700,
									}}>
									CAD
								</span>
							</ToolbarButton>
							<ToolbarButton
								title="Toggle keyboard"
								onClick={toggleKeyboard}>
								<Keyboard size={14} />
							</ToolbarButton>
						</>
					)}
					<ToolbarButton
						title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
						onClick={() => setFullscreen(!fullscreen)}>
						{fullscreen ? (
							<Minimize2 size={14} />
						) : (
							<Maximize2 size={14} />
						)}
					</ToolbarButton>
					<ToolbarButton
						title="Close RDP"
						onClick={() => vmService.closeGuac()}
						color="#ef4444">
						<X size={14} />
					</ToolbarButton>
				</div>
			</div>

			{/* Guacamole renders into this container */}
			<div
				ref={displayRef}
				style={{
					flex: 1,
					minHeight: fullscreen ? undefined : 480,
					background: '#0a0a0a',
					cursor: connected ? 'default' : 'not-allowed',
					overflow: 'hidden',
				}}
			/>

			{/* Status bar */}
			<div
				style={{
					padding: '0.4rem 1rem',
					borderTop: '1px solid var(--sl-color-gray-5, #30363d)',
					fontSize: '0.65rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					textAlign: 'center',
				}}>
				{connected
					? 'Click inside to capture keyboard · Ctrl+Alt+Del via toolbar · RDP via Guacamole'
					: 'Waiting for RDP connection...'}
			</div>
		</div>
	);
}

function ToolbarButton({
	title,
	onClick,
	color,
	children,
}: {
	title: string;
	onClick: () => void;
	color?: string;
	children: React.ReactNode;
}) {
	return (
		<button
			title={title}
			onClick={onClick}
			style={{
				display: 'flex',
				alignItems: 'center',
				padding: 4,
				borderRadius: 4,
				border: 'none',
				background: 'transparent',
				color: color ?? 'var(--sl-color-gray-3, #8b949e)',
				cursor: 'pointer',
			}}>
			{children}
		</button>
	);
}
