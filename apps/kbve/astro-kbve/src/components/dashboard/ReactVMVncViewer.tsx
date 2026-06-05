import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { vmService } from './vmService';
import { X, Maximize2, Minimize2, Keyboard, Users, Crown } from 'lucide-react';

// noVNC RFB client — loaded from vendored ESM in public/vendor/novnc/.
// The npm package (@novnc/novnc) ships CJS with a top-level await in
// browser.js that Rollup cannot parse, so it cannot be bundled directly.
// Vendored ESM (from noVNC GitHub) is the primary path; npm kept as
// @vite-ignore dev fallback only.
let RFB: any = null;
async function loadRFB() {
	if (!RFB) {
		try {
			// Primary: vendored ESM — bypasses Vite module graph via full URL
			const vendorUrl = `${window.location.origin}/vendor/novnc/core/rfb.js`;
			const mod = await import(/* @vite-ignore */ vendorUrl);
			RFB = mod.default ?? mod;
		} catch (vendorErr) {
			console.warn('noVNC vendored ESM failed:', vendorErr);
			try {
				// Fallback: npm package (dev mode only, not bundleable)
				// eslint-disable-next-line @typescript-eslint/ban-ts-comment
				// @ts-ignore — @novnc/novnc has no type declarations
				const mod = await import(
					/* @vite-ignore */ '@novnc/novnc/lib/rfb'
				);
				RFB = mod.default ?? mod;
			} catch (npmErr) {
				console.error('noVNC load failed (vendored):', vendorErr);
				console.error('noVNC load failed (npm):', npmErr);
				throw new Error(
					`noVNC module failed to load: ${vendorErr instanceof Error ? vendorErr.message : 'unknown error'}`,
				);
			}
		}
	}
	return RFB;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 2000;

export default function ReactVMVncViewer() {
	const vncTarget = useStore(vmService.$vncTarget);
	const rfbRef = useRef<InstanceType<typeof RFB> | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const viewerRef = useRef<HTMLDivElement>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState('Connecting...');
	const [keyboardVisible, setKeyboardVisible] = useState(false);
	const [viewerCount, setViewerCount] = useState(0);
	const [isPrimary, setIsPrimary] = useState(false);
	const reconnectAttemptRef = useRef(0);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const intentionalCloseRef = useRef(false);

	// Poll viewer count while connected
	useEffect(() => {
		if (!vncTarget || !connected) {
			setViewerCount(0);
			setIsPrimary(false);
			return;
		}

		const pollViewerCount = async () => {
			try {
				const info = await vmService.getVNCSessionInfo(vncTarget);
				if (info) {
					setViewerCount(info.viewers);
					setIsPrimary(info.has_primary);
				}
			} catch {
				// Silently ignore — the connection may have dropped
			}
		};

		pollViewerCount();
		const interval = setInterval(pollViewerCount, 5000);
		return () => clearInterval(interval);
	}, [vncTarget, connected]);

	const cleanup = useCallback(() => {
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
		if (rfbRef.current) {
			rfbRef.current.disconnect();
			rfbRef.current = null;
		}
		setConnected(false);
		setStatus('Disconnected');
		setViewerCount(0);
		setIsPrimary(false);
	}, []);

	const connectVNC = useCallback(async (target: string) => {
		const viewerEl = viewerRef.current;
		if (!viewerEl) return;

		viewerEl.innerHTML = '';

		const wsUrl = vmService.getVNCWebSocketURL(target);
		setStatus(
			reconnectAttemptRef.current > 0
				? `Reconnecting (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})...`
				: 'Connecting...',
		);

		try {
			const RFBClass = await loadRFB();
			if (intentionalCloseRef.current || viewerRef.current !== viewerEl) {
				return;
			}
			const rfb = new RFBClass(viewerEl, wsUrl, {
				wsProtocols: ['binary.k8s.io', 'base64.binary.k8s.io'],
			});

			rfb.scaleViewport = true;
			rfb.resizeSession = false;
			rfb.clipViewport = false;
			rfb.showDotCursor = true;
			rfb.qualityLevel = 6;
			rfb.compressionLevel = 2;

			rfb.addEventListener('connect', () => {
				setConnected(true);
				setStatus(`Connected to ${target}`);
				reconnectAttemptRef.current = 0;
			});

			rfb.addEventListener(
				'disconnect',
				(e: { detail: { clean: boolean } }) => {
					setConnected(false);
					rfbRef.current = null;

					if (intentionalCloseRef.current) {
						setStatus('Disconnected');
						return;
					}

					if (e.detail.clean) {
						setStatus('Disconnected — server closed connection');
					} else {
						setStatus('Connection lost — attempting reconnect...');
					}

					// Auto-reconnect on unexpected disconnects
					if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
						reconnectAttemptRef.current += 1;
						const delay =
							RECONNECT_BASE_DELAY_MS *
							Math.pow(1.5, reconnectAttemptRef.current - 1);
						setStatus(
							`Reconnecting in ${Math.round(delay / 1000)}s (${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})...`,
						);
						reconnectTimerRef.current = setTimeout(() => {
							connectVNC(target);
						}, delay);
					} else {
						setStatus(
							'Connection lost — max reconnect attempts reached. Click to retry.',
						);
					}
				},
			);

			rfb.addEventListener('securityfailure', () => {
				setStatus('Security handshake failed');
			});

			rfbRef.current = rfb;
		} catch (err) {
			setStatus(
				`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`,
			);
		}
	}, []);

	useEffect(() => {
		if (!vncTarget) {
			intentionalCloseRef.current = false;
			cleanup();
			return;
		}

		reconnectAttemptRef.current = 0;
		intentionalCloseRef.current = false;
		connectVNC(vncTarget);

		return () => {
			intentionalCloseRef.current = true;
			cleanup();
		};
	}, [vncTarget, connectVNC, cleanup]);

	useEffect(() => {
		const teardown = () => {
			intentionalCloseRef.current = true;
			cleanup();
			if (
				typeof document !== 'undefined' &&
				document.fullscreenElement === containerRef.current
			) {
				document.exitFullscreen().catch(() => undefined);
			}
		};
		document.addEventListener('astro:before-swap', teardown);
		document.addEventListener('astro:before-preparation', teardown);
		window.addEventListener('pagehide', teardown);
		return () => {
			document.removeEventListener('astro:before-swap', teardown);
			document.removeEventListener('astro:before-preparation', teardown);
			window.removeEventListener('pagehide', teardown);
		};
	}, [cleanup]);

	useEffect(() => {
		const onFsChange = () => {
			const active = document.fullscreenElement === containerRef.current;
			setFullscreen(active);
		};
		document.addEventListener('fullscreenchange', onFsChange);
		return () =>
			document.removeEventListener('fullscreenchange', onFsChange);
	}, []);

	useEffect(() => {
		if (!rfbRef.current) return;
		const rafId = requestAnimationFrame(() => {
			window.dispatchEvent(new Event('resize'));
		});
		return () => cancelAnimationFrame(rafId);
	}, [fullscreen]);

	const toggleFullscreen = useCallback(() => {
		const el = containerRef.current;
		if (!el) return;
		if (document.fullscreenElement === el) {
			document.exitFullscreen().catch(() => setFullscreen(false));
			return;
		}
		if (typeof el.requestFullscreen === 'function') {
			el.requestFullscreen().catch(() => setFullscreen((f) => !f));
		} else {
			setFullscreen((f) => !f);
		}
	}, []);

	// Manual retry handler
	const handleRetry = useCallback(() => {
		if (vncTarget && !connected) {
			reconnectAttemptRef.current = 0;
			connectVNC(vncTarget);
		}
	}, [vncTarget, connected, connectVNC]);

	// Ctrl+Alt+Del sender
	const sendCtrlAltDel = useCallback(() => {
		rfbRef.current?.sendCtrlAltDel();
	}, []);

	// Toggle virtual keyboard (mobile/tablet)
	const toggleKeyboard = useCallback(() => {
		if (rfbRef.current) {
			rfbRef.current.focusOnClick = !keyboardVisible;
			setKeyboardVisible(!keyboardVisible);
		}
	}, [keyboardVisible]);

	if (!vncTarget) return null;

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
				height: fullscreen ? '100vh' : undefined,
			}}>
			{/* noVNC renders into this container */}
			<div
				ref={viewerRef}
				onClick={!connected ? handleRetry : undefined}
				style={{
					flex: 1,
					minHeight: fullscreen ? undefined : 480,
					height: fullscreen ? undefined : 480,
					background: '#0a0a0a',
					cursor: connected
						? 'default'
						: status.includes('Click to retry')
							? 'pointer'
							: 'not-allowed',
				}}
			/>

			{/* Bottom toolbar — controls + status */}
			<div
				style={{
					borderTop: '1px solid var(--sl-color-gray-5, #30363d)',
					background: 'var(--sl-color-gray-6, #161b22)',
					flexShrink: 0,
					pointerEvents: 'auto',
					position: 'relative',
					zIndex: 1,
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '0.5rem 1rem',
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
								boxShadow: connected
									? '0 0 6px #22c55e'
									: 'none',
							}}
						/>
						<span
							style={{
								fontSize: '0.8rem',
								color: 'var(--sl-color-text, #e6edf3)',
								fontWeight: 500,
							}}>
							{status}
						</span>
						{/* Viewer count badge */}
						{connected && viewerCount > 0 && (
							<span
								style={{
									display: 'inline-flex',
									alignItems: 'center',
									gap: 3,
									padding: '1px 6px',
									borderRadius: 4,
									fontSize: '0.65rem',
									fontWeight: 600,
									background: 'rgba(6, 182, 212, 0.15)',
									border: '1px solid rgba(6, 182, 212, 0.3)',
									color: '#06b6d4',
								}}>
								<Users size={10} />
								{viewerCount}
								{isPrimary && (
									<Crown
										size={9}
										style={{
											color: '#f59e0b',
											marginLeft: 1,
										}}
									/>
								)}
							</span>
						)}
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
							title={
								fullscreen ? 'Exit fullscreen' : 'Fullscreen'
							}
							onClick={toggleFullscreen}>
							{fullscreen ? (
								<Minimize2 size={14} />
							) : (
								<Maximize2 size={14} />
							)}
						</ToolbarButton>
						<ToolbarButton
							title="Close VNC"
							onClick={() => {
								intentionalCloseRef.current = true;
								vmService.closeVNC();
							}}
							color="#ef4444">
							<X size={14} />
						</ToolbarButton>
					</div>
				</div>
				<div
					style={{
						padding: '0.25rem 1rem 0.4rem',
						fontSize: '0.65rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						textAlign: 'center',
					}}>
					{connected
						? `Click inside to capture keyboard · Ctrl+Alt+Del via toolbar${viewerCount > 1 ? ` · ${viewerCount} viewers connected` : ''}`
						: status.includes('Click to retry')
							? 'Click the viewer area to retry connection'
							: 'Waiting for VNC connection...'}
				</div>
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
