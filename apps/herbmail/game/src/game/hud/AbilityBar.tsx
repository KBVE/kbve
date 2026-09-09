import { useEffect, useState } from 'react';
import { SPECIALS } from '../combat/ability';
import { cooldownRemaining } from '../combat/castSystem';
import { playerEid } from '../character/playerEntity';
import { PlayerStats } from '../character/playerStats';

interface SlotState {
	cd: number;
	mp: number;
}

// Bottom-center ability bar: one cell per special (keys 1-4) with icon, MP cost,
// a bottom-up cooldown wipe + seconds readout, greyed when unaffordable. Polls
// the ECS cooldown/MP directly on an interval (same approach as DebugStats) so
// it stays a plain DOM component outside the Canvas.
export function AbilityBar() {
	const [state, setState] = useState<SlotState[]>(() =>
		SPECIALS.map(() => ({ cd: 0, mp: 0 })),
	);

	useEffect(() => {
		const id = setInterval(() => {
			const eid = playerEid();
			const mp = PlayerStats.mp.value[PlayerStats.eid];
			setState(
				SPECIALS.map((a) => ({
					cd: cooldownRemaining(eid, a.slot),
					mp,
				})),
			);
		}, 100);
		return () => clearInterval(id);
	}, []);

	return (
		<div
			style={{
				position: 'fixed',
				bottom: '1.4rem',
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				gap: 8,
				pointerEvents: 'none',
				userSelect: 'none',
			}}>
			{SPECIALS.map((a, i) => {
				const { cd, mp } = state[i];
				const onCd = cd > 0;
				const affordable = mp >= a.mpCost;
				const cdFrac = a.cooldown > 0 ? cd / a.cooldown : 0;
				const dim = onCd || !affordable;
				return (
					<div
						key={a.id}
						style={{
							position: 'relative',
							width: 52,
							height: 52,
							borderRadius: 8,
							overflow: 'hidden',
							background: 'rgba(12,12,18,0.82)',
							border: `1px solid ${onCd ? '#5a5a68' : affordable ? '#7c6a3a' : '#4a2a2a'}`,
							color: dim ? '#7a7a86' : '#e6dcc0',
							font: '11px monospace',
							textShadow: '0 1px 2px #000',
						}}>
						<div
							style={{
								position: 'absolute',
								top: 3,
								left: 5,
								opacity: 0.7,
							}}>
							{a.slot}
						</div>
						<div
							style={{
								position: 'absolute',
								inset: 0,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 22,
								filter: dim ? 'grayscale(1)' : 'none',
								opacity: dim ? 0.5 : 1,
							}}>
							{a.icon}
						</div>
						<div
							style={{
								position: 'absolute',
								bottom: 2,
								right: 5,
								color: affordable ? '#7aa6ff' : '#d06a6a',
							}}>
							{a.mpCost}
						</div>
						{onCd && (
							<>
								<div
									style={{
										position: 'absolute',
										left: 0,
										right: 0,
										bottom: 0,
										height: `${cdFrac * 100}%`,
										background: 'rgba(0,0,0,0.55)',
									}}
								/>
								<div
									style={{
										position: 'absolute',
										inset: 0,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 15,
										color: '#e6dcc0',
									}}>
									{cd.toFixed(1)}
								</div>
							</>
						)}
					</div>
				);
			})}
		</div>
	);
}
