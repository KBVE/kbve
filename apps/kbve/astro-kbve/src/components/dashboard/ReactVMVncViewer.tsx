import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { vmService } from './vmService';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';

export default function ReactVMVncViewer() {
	const vncTarget = useStore(vmService.$vncTarget);
	const accessToken = useStore(vmService.$accessToken);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const [connected, setConnected] = useState(false);
	const [status, setStatus] = useState('Connecting...');
	const containerRef = useRef<HTMLDivElement>(null);

	const cleanup = useCallback(() => {
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}
		setConnected(false);
		setStatus('Disconnected');
	}, []);

	useEffect(() => {
		if (!vncTarget || !accessToken) {
			cleanup();
			return;
		}

		const wsUrl = vmService.getVNCWebSocketURL(vncTarget);
		setStatus('Connecting...');

		const ws = new WebSocket(wsUrl, ['base64.binary.k8s.io']);
		wsRef.current = ws;

		ws.binaryType = 'arraybuffer';

		ws.onopen = () => {
			setConnected(true);
			setStatus(`Connected to ${vncTarget}`);
		};

		ws.onclose = () => {
			setConnected(false);
			setStatus('Connection closed');
		};

		ws.onerror = () => {
			setConnected(false);
			setStatus('Connection error — VNC may not be available');
		};

		ws.onmessage = (event) => {
			// Raw VNC/RFB frames — for a full implementation you would use
			// a noVNC library here. This minimal viewer renders a placeholder
			// with connection status. To get full interactive VNC, integrate
			// @novnc/novnc or a similar library.
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			// Draw a simple "connected" indicator
			ctx.fillStyle = '#0a0a0a';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = '#22c55e';
			ctx.font = '14px monospace';
			ctx.fillText(`VNC stream active — ${vncTarget}`, 20, 30);
			ctx.fillStyle = '#8b949e';
			ctx.font = '11px monospace';
			ctx.fillText('Receiving framebuffer data...', 20, 50);
			ctx.fillText(
				'Full noVNC integration renders interactive desktop here.',
				20,
				70,
			);
		};

		return cleanup;
	}, [vncTarget, accessToken, cleanup]);

	// Handle keyboard events
	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Escape') {
			vmService.closeVNC();
		}
		// In a full noVNC implementation, key events would be forwarded
		// to the VM via the WebSocket connection
	}, []);

	if (!vncTarget) return null;

	return (
		<div
			ref={containerRef}
			className="not-content"
			onKeyDown={handleKeyDown}
			tabIndex={0}
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
					<button
						onClick={() => setFullscreen(!fullscreen)}
						style={{
							display: 'flex',
							alignItems: 'center',
							padding: 4,
							borderRadius: 4,
							border: 'none',
							background: 'transparent',
							color: 'var(--sl-color-gray-3, #8b949e)',
							cursor: 'pointer',
						}}>
						{fullscreen ? (
							<Minimize2 size={14} />
						) : (
							<Maximize2 size={14} />
						)}
					</button>
					<button
						onClick={() => vmService.closeVNC()}
						style={{
							display: 'flex',
							alignItems: 'center',
							padding: 4,
							borderRadius: 4,
							border: 'none',
							background: 'transparent',
							color: '#ef4444',
							cursor: 'pointer',
						}}>
						<X size={14} />
					</button>
				</div>
			</div>

			{/* Canvas */}
			<div
				style={{
					flex: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					minHeight: fullscreen ? undefined : 480,
					padding: '1rem',
				}}>
				<canvas
					ref={canvasRef}
					width={1024}
					height={768}
					style={{
						maxWidth: '100%',
						maxHeight: '100%',
						borderRadius: 4,
						background: '#0a0a0a',
						cursor: connected ? 'default' : 'not-allowed',
					}}
				/>
			</div>

			{/* Hint */}
			<div
				style={{
					padding: '0.4rem 1rem',
					borderTop: '1px solid var(--sl-color-gray-5, #30363d)',
					fontSize: '0.65rem',
					color: 'var(--sl-color-gray-3, #8b949e)',
					textAlign: 'center',
				}}>
				Press Escape to close · Full noVNC integration renders
				interactive desktop with keyboard and mouse forwarding
			</div>
		</div>
	);
}
