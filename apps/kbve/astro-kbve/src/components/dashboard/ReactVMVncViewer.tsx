import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { vmService } from './vmService';
import { X, Maximize2, Minimize2, Keyboard } from 'lucide-react';

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

export default function ReactVMVncViewer() {
	const vncTarget = useStore(vmService.$vncTarget);
	const rfbRef = useRef<InstanceType<typeof RFB> | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const viewerRef = useRef<HTMLDivElement>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState('Connecting...');
	const [keyboardVisible, setKeyboardVisible] = useState(false);

	const cleanup = useCallback(() => {
		if (rfbRef.current) {
			rfbRef.current.disconnect();
			rfbRef.current = null;
		}
		setConnected(false);
		setStatus('Disconnected');
	}, []);

	useEffect(() => {
		if (!vncTarget) {
			cleanup();
			return;
		}

		const target = viewerRef.current;
		if (!target) return;

		// Clear previous content
		target.innerHTML = '';

		const wsUrl = vmService.getVNCWebSocketURL(vncTarget);
		setStatus('Connecting...');

		(async () => {
			try {
				const RFBClass = await loadRFB();
				const rfb = new RFBClass(target, wsUrl, {
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
					setStatus(`Connected to ${vncTarget}`);
				});

				rfb.addEventListener(
					'disconnect',
					(e: { detail: { clean: boolean } }) => {
						setConnected(false);
						setStatus(
							e.detail.clean
								? 'Disconnected cleanly'
								: 'Connection lost — VM may have stopped',
						);
						rfbRef.current = null;
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
		})();

		return cleanup;
	}, [vncTarget, cleanup]);

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
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
						title="Close VNC"
						onClick={() => vmService.closeVNC()}
						color="#ef4444">
						<X size={14} />
					</ToolbarButton>
				</div>
			</div>

			{/* noVNC renders into this container */}
			<div
				ref={viewerRef}
				style={{
					flex: 1,
					minHeight: fullscreen ? undefined : 480,
					background: '#0a0a0a',
					cursor: connected ? 'default' : 'not-allowed',
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
					? 'Click inside to capture keyboard · Ctrl+Alt+Del via toolbar'
					: 'Waiting for VNC connection...'}
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
