import { useState } from 'react';
import type { PetLearnOffer } from '@kbve/laser';
import { PetLearnPromptView } from '../../web/src/game/ui/pets/PetLearnPrompt';

/** Test-only wrapper. `onReply` fires in the browser and is invisible to the Node-side
 * test body, so answers are collected here and rendered into the DOM. `null` (decline) is
 * kept distinguishable from slot 0 — conflating them would hide the bug where a decline
 * destroys the first move. Playwright CT can only mount components imported from a module,
 * which is why this isn't inline in the spec. */
export function PetLearnProbe({ offer }: { offer: PetLearnOffer }) {
	const [replies, setReplies] = useState<(number | null)[]>([]);
	return (
		<>
			<PetLearnPromptView
				offer={offer}
				secondsLeft={27}
				onReply={(slot) => setReplies((prev) => [...prev, slot])}
			/>
			<pre data-testid="replies">{JSON.stringify(replies)}</pre>
		</>
	);
}
