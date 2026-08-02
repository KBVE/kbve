import { test, expect } from '@playwright/experimental-ct-react';
import type { PetLearnOffer } from '@kbve/laser';
import { PetLearnPromptView } from '../../web/src/game/ui/pets/PetLearnPrompt';
import { PetLearnProbe } from './PetLearnProbe';

// `status` is spelled as a literal, not imported from `@kbve/laser`: spec files are
// evaluated in Node, which cannot resolve that package, so only type imports (erased at
// compile time) work here. 0 is `PET_LEARN_OFFER`.
const offer: PetLearnOffer = {
	status: 0,
	pet_id: '01J',
	nickname: 'Rex',
	ability_id: 'overclock',
	ability_name: 'Overclock',
	known: ['tackle', 'spark-bark', 'static-bite', 'plate-up'],
	deadline_ms: 30_000,
};

test('offers every known move as a forget target plus a decline', async ({
	mount,
}) => {
	const component = await mount(
		<PetLearnPromptView
			offer={offer}
			secondsLeft={30}
			onReply={() => {}}
		/>,
	);
	await expect(component.getByText('Rex can learn Overclock')).toBeVisible();
	for (const label of [
		'Forget Tackle',
		'Forget Spark Bark',
		'Forget Static Bite',
		'Forget Plate Up',
	]) {
		await expect(
			component.getByRole('button', { name: label }),
		).toBeVisible();
	}
	await expect(
		component.getByRole('button', { name: 'Keep current moves' }),
	).toBeVisible();
	await expect(component.getByTestId('pet-learn-timer')).toHaveText('30s');
});

test('choosing a move reports its slot index', async ({ mount }) => {
	const component = await mount(<PetLearnProbe offer={offer} />);
	await component.getByRole('button', { name: 'Forget Static Bite' }).click();
	// Index 2, not the ability id — the server addresses slots positionally.
	await expect(component.getByTestId('replies')).toHaveText('[2]');
});

test('declining reports null rather than slot 0', async ({ mount }) => {
	// The bug this guards: sending 0 for a decline would forget the first move.
	const component = await mount(<PetLearnProbe offer={offer} />);
	await component.getByRole('button', { name: 'Keep current moves' }).click();
	await expect(component.getByTestId('replies')).toHaveText('[null]');
});

test('falls back to a readable label when the server sent no ability name', async ({
	mount,
}) => {
	const component = await mount(
		<PetLearnPromptView
			offer={{ ...offer, ability_name: '' }}
			secondsLeft={5}
			onReply={() => {}}
		/>,
	);
	await expect(component.getByText('Rex can learn Overclock')).toBeVisible();
});
