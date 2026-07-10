import type { ViewmodelRest } from './config';

interface Props {
	value: ViewmodelRest;
	onChange: (next: ViewmodelRest) => void;
}

const PI = Math.PI;

const rows: Array<{
	key: keyof ViewmodelRest;
	label: string;
	min: number;
	max: number;
	step: number;
}> = [
	{ key: 'px', label: 'pos x', min: -1, max: 1, step: 0.005 },
	{ key: 'py', label: 'pos y', min: -2, max: 1, step: 0.005 },
	{ key: 'pz', label: 'pos z', min: -3, max: 0.5, step: 0.005 },
	{ key: 'rx', label: 'rot x', min: -PI, max: PI, step: 0.01 },
	{ key: 'ry', label: 'rot y', min: -PI, max: PI, step: 0.01 },
	{ key: 'rz', label: 'rot z', min: -PI, max: PI, step: 0.01 },
	{ key: 'scale', label: 'scale', min: 0.01, max: 0.6, step: 0.002 },
];

export function ViewmodelDebug({ value, onChange }: Props) {
	const set = (key: keyof ViewmodelRest, v: number) =>
		onChange({ ...value, [key]: v });

	return (
		<div
			style={{
				position: 'fixed',
				top: 12,
				right: 12,
				padding: '12px 14px',
				background: 'rgba(10,10,14,0.92)',
				border: '1px solid #3a3a44',
				borderRadius: 8,
				color: '#c9c9d6',
				font: '12px monospace',
				pointerEvents: 'auto',
				userSelect: 'none',
				width: 300,
				zIndex: 10,
			}}>
			<div style={{ marginBottom: 4, opacity: 0.7 }}>viewmodel rest</div>
			<div
				style={{
					marginBottom: 10,
					opacity: 0.5,
					fontSize: 11,
					lineHeight: 1.5,
				}}>
				arrow keys (always on):
				<br />
				↑ out · ↓ back · ← down · → up
				<br />
				N/M x · [ ] scale · I/K pitch · J/L yaw · U/O roll
				<br />0 = reset · Enter = log
			</div>
			{rows.map((r) => (
				<div key={r.key} style={{ marginBottom: 12 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 4,
						}}>
						<span style={{ width: 46 }}>{r.label}</span>
						<input
							type="number"
							value={value[r.key]}
							step={r.step}
							onChange={(e) => set(r.key, Number(e.target.value))}
							style={{
								width: 70,
								background: '#16161c',
								color: '#e8e8f0',
								border: '1px solid #3a3a44',
								borderRadius: 4,
								padding: '3px 5px',
								font: '12px monospace',
							}}
						/>
					</div>
					<input
						type="range"
						min={r.min}
						max={r.max}
						step={r.step}
						value={value[r.key]}
						onChange={(e) => set(r.key, Number(e.target.value))}
						style={{ width: '100%', height: 22 }}
					/>
				</div>
			))}
			<button
				type="button"
				onClick={() =>
					console.info('[viewmodel] REST =', JSON.stringify(value))
				}
				style={{
					width: '100%',
					marginTop: 4,
					padding: '6px',
					background: '#22323a',
					color: '#cfe',
					border: '1px solid #3a5a66',
					borderRadius: 5,
					font: '12px monospace',
					cursor: 'pointer',
				}}>
				log REST to console
			</button>
		</div>
	);
}
