export interface PsxSettings {
	dpr: number;
	snap: number;
	affine: number;
	eye: number;
	fov: number;
}

interface Props {
	value: PsxSettings;
	onChange: (next: PsxSettings) => void;
}

const rows: Array<{
	key: keyof PsxSettings;
	label: string;
	min: number;
	max: number;
	step: number;
}> = [
	{ key: 'dpr', label: 'resolution (dpr)', min: 0.2, max: 1, step: 0.05 },
	{ key: 'snap', label: 'vertex snap', min: 40, max: 600, step: 10 },
	{ key: 'affine', label: 'affine warp', min: 0, max: 1, step: 0.05 },
	{ key: 'eye', label: 'camera height', min: 0.6, max: 4.5, step: 0.05 },
	{ key: 'fov', label: 'field of view', min: 55, max: 100, step: 1 },
];

export function DebugPanel({ value, onChange }: Props) {
	return (
		<div
			style={{
				position: 'fixed',
				top: 12,
				left: 12,
				padding: '10px 12px',
				background: 'rgba(10,10,14,0.8)',
				border: '1px solid #333',
				borderRadius: 6,
				color: '#c9c9d6',
				font: '12px monospace',
				pointerEvents: 'auto',
				userSelect: 'none',
				width: 200,
			}}>
			<div style={{ marginBottom: 8, opacity: 0.7 }}>PSX dials</div>
			{rows.map((r) => (
				<label
					key={r.key}
					style={{ display: 'block', marginBottom: 8 }}>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
						}}>
						<span>{r.label}</span>
						<span>{value[r.key].toFixed(2)}</span>
					</div>
					<input
						type="range"
						min={r.min}
						max={r.max}
						step={r.step}
						value={value[r.key]}
						onChange={(e) =>
							onChange({
								...value,
								[r.key]: Number(e.target.value),
							})
						}
						style={{ width: '100%' }}
					/>
				</label>
			))}
		</div>
	);
}
