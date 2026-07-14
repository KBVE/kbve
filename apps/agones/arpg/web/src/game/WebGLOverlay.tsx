import { useEffect, useState } from 'react';

const PANEL: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: '14px',
	padding: '28px 32px',
	borderRadius: '10px',
	background: '#181c28',
	border: '1px solid #3c465c',
	minWidth: '300px',
	maxWidth: '420px',
	fontFamily: 'monospace',
	color: '#e6ebf5',
};

const BACKDROP: React.CSSProperties = {
	position: 'absolute',
	inset: 0,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	background: 'rgba(8,9,14,0.92)',
	zIndex: 40,
};

const RELOAD_BTN: React.CSSProperties = {
	padding: '10px 12px',
	fontSize: '14px',
	fontFamily: 'monospace',
	fontWeight: 700,
	borderRadius: '6px',
	border: 'none',
	background: '#6ea8ff',
	color: '#0b0e16',
	cursor: 'pointer',
};

export default function WebGLOverlay({
	mode,
}: {
	mode: 'lost' | 'unsupported';
}) {
	const [stalled, setStalled] = useState(false);

	useEffect(() => {
		if (mode !== 'lost') return;
		setStalled(false);
		const t = window.setTimeout(() => setStalled(true), 6000);
		return () => window.clearTimeout(t);
	}, [mode]);

	const reload = () => window.location.reload();

	if (mode === 'unsupported') {
		return (
			<div style={BACKDROP}>
				<div style={PANEL}>
					<div style={{ fontSize: '15px', color: '#fcd34d' }}>
						Graphics couldn't start
					</div>
					<div
						style={{
							fontSize: '13px',
							lineHeight: 1.6,
							color: '#9fb3d8',
						}}>
						Your browser couldn't open a WebGL graphics context.
						This is usually the browser or GPU, not the game. Try,
						in order:
					</div>
					<ol
						style={{
							margin: 0,
							paddingLeft: '20px',
							fontSize: '13px',
							lineHeight: 1.7,
							color: '#cdd8ee',
						}}>
						<li>
							Fully quit your browser (Cmd/Ctrl+Q) and reopen it.
						</li>
						<li>
							Turn on hardware acceleration in browser settings.
						</li>
						<li>
							Close other heavy graphics/3D tabs, then reload.
						</li>
						<li>Try a different browser or a private window.</li>
					</ol>
					<button type="button" onClick={reload} style={RELOAD_BTN}>
						Reload
					</button>
				</div>
			</div>
		);
	}

	return (
		<div style={BACKDROP}>
			<div style={{ ...PANEL, textAlign: 'center' }}>
				<div style={{ fontSize: '15px', color: '#fcd34d' }}>
					Graphics paused
				</div>
				<div
					style={{
						fontSize: '13px',
						lineHeight: 1.6,
						color: '#9fb3d8',
					}}>
					{stalled
						? 'The graphics context was lost and is taking a while to recover. Reloading usually fixes it.'
						: 'Lost the graphics context — trying to recover…'}
				</div>
				{stalled && (
					<button type="button" onClick={reload} style={RELOAD_BTN}>
						Reload
					</button>
				)}
			</div>
		</div>
	);
}
