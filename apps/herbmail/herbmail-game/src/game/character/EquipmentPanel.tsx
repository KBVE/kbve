import {
	ARMOR_PIECES,
	setAllArmor,
	toggleArmor,
	useEquippedArmor,
} from './armor';
import { BODY_SLIDERS, setBodyMorph, useBodyMorph } from './body';

export function EquipmentPanel() {
	const equipped = useEquippedArmor();
	const morph = useBodyMorph();
	return (
		<div
			style={{
				position: 'fixed',
				bottom: 12,
				right: 12,
				minWidth: 150,
				padding: '8px 12px',
				background: 'rgba(10,10,14,0.8)',
				border: '1px solid #333',
				borderRadius: 6,
				color: '#c9c9d6',
				font: '12px monospace',
			}}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
					marginBottom: 6,
				}}>
				<span style={{ opacity: 0.55 }}>equipment</span>
				<span style={{ display: 'flex', gap: 4 }}>
					<button
						onClick={() => setAllArmor(true)}
						style={{
							padding: '1px 6px',
							background: 'rgba(60,60,70,0.3)',
							border: '1px solid #444',
							borderRadius: 4,
							color: '#aaa',
							font: '11px monospace',
							cursor: 'pointer',
						}}>
						all
					</button>
					<button
						onClick={() => setAllArmor(false)}
						style={{
							padding: '1px 6px',
							background: 'rgba(60,60,70,0.3)',
							border: '1px solid #444',
							borderRadius: 4,
							color: '#aaa',
							font: '11px monospace',
							cursor: 'pointer',
						}}>
						none
					</button>
				</span>
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				{ARMOR_PIECES.map((p) => {
					const on = equipped.has(p.id);
					return (
						<button
							key={p.id}
							onClick={() => toggleArmor(p.id)}
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								gap: 12,
								padding: '3px 8px',
								background: on
									? 'rgba(80,140,90,0.35)'
									: 'rgba(60,60,70,0.3)',
								border: `1px solid ${on ? '#5a8' : '#444'}`,
								borderRadius: 4,
								color: on ? '#e8f0e8' : '#888',
								font: '12px monospace',
								cursor: 'pointer',
							}}>
							<span>{p.label}</span>
							<span>{on ? 'on' : 'off'}</span>
						</button>
					);
				})}
			</div>
			<div style={{ opacity: 0.55, margin: '10px 0 6px' }}>body</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{BODY_SLIDERS.map((s) => (
					<label
						key={s.id}
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							font: '11px monospace',
							color: '#c9c9d6',
						}}>
						<span style={{ flex: '0 0 64px' }}>{s.label}</span>
						<input
							type="range"
							min={0}
							max={1}
							step={0.01}
							value={morph[s.id]}
							onChange={(e) =>
								setBodyMorph(
									s.id,
									e.currentTarget.valueAsNumber,
								)
							}
							style={{ flex: 1 }}
						/>
					</label>
				))}
			</div>
		</div>
	);
}
