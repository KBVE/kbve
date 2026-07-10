import { ARMOR_PIECES, toggleArmor, useEquippedArmor } from './armor';

export function EquipmentPanel() {
	const equipped = useEquippedArmor();
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
			<div style={{ opacity: 0.55, marginBottom: 6 }}>equipment</div>
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
		</div>
	);
}
