import { equipmentById } from '../viewmodel/equipment';

interface Props {
	kind: string | null;
	equippedId: string;
}

const line: React.CSSProperties = {
	position: 'absolute',
	background: 'rgba(230,230,235,0.85)',
	boxShadow: '0 0 2px #000',
};

export function Hud({ kind, equippedId }: Props) {
	const equip = equipmentById(equippedId);
	return (
		<>
			<div
				style={{
					position: 'fixed',
					inset: 0,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					pointerEvents: 'none',
				}}>
				<div
					style={{
						position: 'relative',
						width: 20,
						height: 20,
						transform: 'translateY(-13vh)',
					}}>
					<div
						style={{
							...line,
							left: 0,
							right: 0,
							top: 9,
							height: 2,
						}}
					/>
					<div
						style={{
							...line,
							top: 0,
							bottom: 0,
							left: 9,
							width: 2,
						}}
					/>
				</div>
			</div>

			<div
				style={{
					position: 'fixed',
					top: 12,
					left: 12,
					minWidth: 150,
					padding: '8px 12px',
					background: 'rgba(10,10,14,0.8)',
					border: '1px solid #333',
					borderRadius: 6,
					color: '#c9c9d6',
					font: '12px monospace',
					pointerEvents: 'none',
				}}>
				<div style={{ opacity: 0.55, marginBottom: 3 }}>aiming at</div>
				<div style={{ fontSize: 15, color: kind ? '#e8e8f0' : '#666' }}>
					{kind ?? '— nothing —'}
				</div>
			</div>

			<div
				style={{
					position: 'fixed',
					bottom: 12,
					left: 12,
					minWidth: 150,
					padding: '8px 12px',
					background: 'rgba(10,10,14,0.8)',
					border: '1px solid #333',
					borderRadius: 6,
					color: '#c9c9d6',
					font: '12px monospace',
					pointerEvents: 'none',
				}}>
				<div style={{ opacity: 0.55, marginBottom: 3 }}>equipped</div>
				<div style={{ fontSize: 15, color: '#e8e8f0' }}>
					{equip.label}
				</div>
				<div style={{ opacity: 0.5, marginTop: 4 }}>
					LMB {equip.primary} · RMB {equip.secondary}
					{equip.reload ? ' · R reload' : ''}
				</div>
			</div>
		</>
	);
}
