import { BODY_SLIDERS, setBodyMorph, useBodyMorph } from '../character/body';
import { kbve } from './tags';

// Body-shape morph sliders. Dev-only, mounted behind the Backquote debug toggle.
export function BodyMorphPanel() {
	const morph = useBodyMorph();
	return (
		<div
			id="body-morph-panel"
			data-x-kbve={kbve('body-panel', {})}
			style={{
				position: 'fixed',
				bottom: 12,
				right: 12,
				zIndex: 21,
				padding: 12,
				background: 'rgba(10,10,14,0.92)',
				border: '1px solid #333',
				borderRadius: 8,
				font: '12px monospace',
				color: '#c9c9d6',
			}}>
			<div style={{ opacity: 0.55, marginBottom: 8 }}>body</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{BODY_SLIDERS.map((s) => (
					<label
						key={s.id}
						id={`body-${s.id}`}
						data-x-kbve={kbve('body', { id: s.id, v: morph[s.id] })}
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
