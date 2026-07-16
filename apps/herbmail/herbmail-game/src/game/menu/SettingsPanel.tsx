import { setScreen } from './store';
import { usePsx, setPsx, type Psx } from './settingsStore';

const ROWS: {
	key: keyof Psx;
	label: string;
	min: number;
	max: number;
	step: number;
}[] = [
	{ key: 'dpr', label: 'Resolution', min: 0.5, max: 2, step: 0.1 },
	{ key: 'snap', label: 'Vertex snap', min: 0, max: 800, step: 10 },
	{ key: 'affine', label: 'Texture warp', min: 0, max: 0.5, step: 0.01 },
	{ key: 'fov', label: 'Field of view', min: 50, max: 100, step: 1 },
];

const wrap: React.CSSProperties = {
	position: 'fixed',
	inset: 0,
	background: '#07070bee',
	color: '#e8e8ee',
	font: '14px/1.5 ui-monospace, monospace',
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	gap: 18,
	zIndex: 45,
};

export function SettingsPanel() {
	const psx = usePsx();
	return (
		<div style={wrap}>
			<div style={{ fontSize: 22, letterSpacing: 4 }}>SETTINGS</div>
			<div style={{ display: 'grid', gap: 14, width: 340 }}>
				{ROWS.map((r) => (
					<label
						key={r.key}
						style={{
							display: 'grid',
							gridTemplateColumns: '1fr auto',
							gap: 6,
						}}>
						<span>{r.label}</span>
						<span style={{ opacity: 0.6 }}>
							{psx[r.key].toFixed(r.step < 1 ? 2 : 0)}
						</span>
						<input
							type="range"
							min={r.min}
							max={r.max}
							step={r.step}
							value={psx[r.key]}
							onChange={(e) =>
								setPsx(r.key, Number(e.target.value))
							}
							style={{ gridColumn: '1 / 3' }}
						/>
					</label>
				))}
			</div>
			<button
				onClick={() => setScreen('main')}
				style={{
					width: 220,
					padding: '10px 0',
					background: '#ffffff10',
					border: '1px solid #ffffff28',
					color: '#fff',
					borderRadius: 6,
					cursor: 'pointer',
					font: 'inherit',
					letterSpacing: 2,
				}}>
				← Menu
			</button>
		</div>
	);
}
