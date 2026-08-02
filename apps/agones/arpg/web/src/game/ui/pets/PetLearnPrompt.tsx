import { useEffect, useRef, useState } from 'react';
import { PET_LEARN_OFFER, type PetLearnOffer } from '@kbve/laser';
import {
	emitPetLearnReply,
	onPetLearnOffer,
	type PetLearnReply,
} from '../../systems/hud';
import { GothicPanel, GothicTitleBar, GothicDivider } from '../gothic/Gothic';

const ACCENT = '#fcd34d';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';

/** Pretty-print an ability id when the server sent no display name. */
function moveLabel(id: string): string {
	return id
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

/** The prompt itself, driven entirely by props so it is testable without the bus.
 *
 * Every button answers: there is deliberately no way to dismiss this without choosing,
 * because a silent dismissal and a decline mean the same thing to the server but read
 * very differently to the player — one looks like the game lost their move. */
export function PetLearnPromptView({
	offer,
	secondsLeft,
	onReply,
}: {
	offer: PetLearnOffer;
	secondsLeft: number;
	onReply: (slot: number | null) => void;
}) {
	const name = offer.ability_name || moveLabel(offer.ability_id);
	return (
		<div
			data-testid="pet-learn-prompt"
			style={{
				position: 'absolute',
				top: '18%',
				left: '50%',
				transform: 'translateX(-50%)',
				width: 'min(92vw, 420px)',
				pointerEvents: 'auto',
				zIndex: 60,
			}}>
			<GothicPanel>
				<GothicTitleBar>
					{offer.nickname} can learn {name}
				</GothicTitleBar>
				<div
					style={{
						padding: '8px 10px',
						color: MUTED,
						fontSize: 12,
						textShadow: TEXT_SHADOW,
					}}>
					{offer.nickname} already knows {offer.known.length} moves.
					Choose one to forget, or keep the current set.
				</div>
				<GothicDivider />
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
						padding: '4px 10px',
					}}>
					{offer.known.map((id, idx) => (
						<button
							key={`${id}-${idx}`}
							type="button"
							onClick={() => onReply(idx)}
							style={{
								textAlign: 'left',
								padding: '6px 8px',
								background: 'rgba(0,0,0,0.45)',
								border: '1px solid #24314a',
								color: '#dbe6ff',
								fontSize: 12,
								cursor: 'pointer',
							}}>
							Forget {moveLabel(id)}
						</button>
					))}
				</div>
				<GothicDivider />
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '6px 10px',
					}}>
					<span
						data-testid="pet-learn-timer"
						style={{
							color: MUTED,
							fontSize: 11,
							textShadow: TEXT_SHADOW,
						}}>
						{secondsLeft}s
					</span>
					<button
						type="button"
						onClick={() => onReply(null)}
						style={{
							padding: '6px 12px',
							background: 'rgba(0,0,0,0.45)',
							border: `1px solid ${ACCENT}`,
							color: ACCENT,
							fontSize: 12,
							fontWeight: 700,
							cursor: 'pointer',
						}}>
						Keep current moves
					</button>
				</div>
			</GothicPanel>
		</div>
	);
}

/** Bus wrapper: shows the live offer, hides on any terminal status.
 *
 * The countdown is cosmetic — the server owns expiry. It ticks off `deadline_ms` measured
 * from when the offer landed, and hitting zero only stops rendering; the authoritative
 * EXPIRED status is what actually closes the prompt, so a stalled tab cannot answer late. */
export function PetLearnPrompt() {
	const [offer, setOffer] = useState<PetLearnOffer | null>(null);
	const anchorRef = useRef(0);
	const [, setTick] = useState(0);

	useEffect(
		() =>
			onPetLearnOffer((next) => {
				if (next.status === PET_LEARN_OFFER) {
					anchorRef.current = Date.now();
					setOffer(next);
					return;
				}
				// Any terminal status closes whatever is open. Not matched against the open
				// offer's pet id: a terminal status for a different pet still means the one on
				// screen is stale, since the server only ever has one prompt live per player.
				setOffer(null);
			}),
		[],
	);

	useEffect(() => {
		if (!offer) return;
		const t = setInterval(() => setTick((n) => n + 1), 250);
		return () => clearInterval(t);
	}, [offer]);

	if (!offer) return null;
	const elapsed = Date.now() - anchorRef.current;
	const secondsLeft = Math.max(
		0,
		Math.ceil((offer.deadline_ms - elapsed) / 1000),
	);
	const reply = (slot: number | null) => {
		const payload: PetLearnReply = { petId: offer.pet_id, slot };
		emitPetLearnReply(payload);
		// Close immediately: the server confirms with a terminal status plus a roster sync,
		// and leaving the prompt up invites a second answer to the same offer.
		setOffer(null);
	};
	return (
		<PetLearnPromptView
			offer={offer}
			secondsLeft={secondsLeft}
			onReply={reply}
		/>
	);
}
