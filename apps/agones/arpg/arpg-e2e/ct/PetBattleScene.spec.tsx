import { test, expect } from '@playwright/experimental-ct-react';
import type { PetBattleState } from '@kbve/laser';
import { PetBattleScene } from '../../web/src/game/ui/D2Hud';

const battler = (nickname: string, hp = 30) => ({
	species_ref: 'mechamutt',
	nickname,
	level: 5,
	hp,
	max_hp: 30,
});

// An "awaiting player action" snapshot with no events to animate, so the action
// menu renders immediately on mount.
const awaitingState: PetBattleState = {
	player: [battler('Rex')],
	enemy: [battler('Spot')],
	p_active: 0,
	e_active: 0,
	moves: [
		{
			slot: 0,
			name: 'Zap',
			element: 'electric',
			category: 1,
			power: 40,
			accuracy: 100,
			pp: 15,
			max_pp: 15,
		},
	],
	events: [],
	outcome: 'Ongoing',
	awaiting: true,
	can_run: true,
	phase: 'action',
	deadline_ms: 20000,
	opponent: 'Tamer Bryn',
	can_catch: false,
};

// A wild encounter: same snapshot with the server's catch permission set.
const wildState: PetBattleState = { ...awaitingState, can_catch: true };

test('renders both battlers and the action menu', async ({ mount }) => {
	const component = await mount(
		<PetBattleScene
			state={awaitingState}
			onAction={() => {}}
			onClose={() => {}}
		/>,
	);
	await expect(component.getByText('Rex')).toBeVisible();
	await expect(component.getByText('Spot')).toBeVisible();
	await expect(component.getByRole('button', { name: /Zap/ })).toBeVisible();
	await expect(component.getByRole('button', { name: /Swap/ })).toBeVisible();
	await expect(component.getByRole('button', { name: /Run/ })).toBeVisible();
});

test('a trainer duel offers no Catch', async ({ mount }) => {
	const component = await mount(
		<PetBattleScene
			state={awaitingState}
			onAction={() => {}}
			onClose={() => {}}
		/>,
	);
	await expect(component.getByRole('button', { name: /Catch/ })).toHaveCount(
		0,
	);
});

test('a wild duel offers Catch with the carried ball count', async ({
	mount,
}) => {
	const component = await mount(
		<PetBattleScene
			state={wildState}
			balls={3}
			onAction={() => {}}
			onClose={() => {}}
		/>,
	);
	// `can_catch` comes from the server; the count comes off the inventory sync.
	await expect(
		component.getByRole('button', { name: /Catch \(3\)/ }),
	).toBeVisible();
});

test('commits the chosen move via onAction', async ({ mount }) => {
	let committed: [number, number] | null = null;
	const component = await mount(
		<PetBattleScene
			state={awaitingState}
			onAction={(action, arg) => {
				committed = [action, arg];
			}}
			onClose={() => {}}
		/>,
	);
	await component.getByRole('button', { name: /Zap/ }).click();
	expect(committed).toEqual([0, 0]);
});
