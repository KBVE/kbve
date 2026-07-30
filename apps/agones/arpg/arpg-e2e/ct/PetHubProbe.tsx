import { useState } from 'react';
import type { PetRosterSync } from '@kbve/laser';
import { PetHubView } from '../../web/src/game/ui/pets/PetHub';
import type { PetRosterOp } from '../../web/src/game/systems/hud';

/** Test-only wrapper: `PetHubView`'s op callback fires in the browser and is not
 * observable from the Node-side test body, so the emitted ops are collected here and
 * rendered into the DOM for the spec to assert on. Playwright CT can only mount
 * components imported from a module, which is why this isn't inline in the spec. */
export function PetHubProbe({ roster }: { roster: PetRosterSync }) {
	const [ops, setOps] = useState<PetRosterOp[]>([]);
	return (
		<>
			<PetHubView
				roster={roster}
				onOp={(op) => setOps((prev) => [...prev, op])}
				onClose={() => {}}
			/>
			<pre data-testid="ops">{JSON.stringify(ops)}</pre>
		</>
	);
}
