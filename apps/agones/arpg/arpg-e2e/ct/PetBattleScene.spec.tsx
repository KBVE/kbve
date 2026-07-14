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
};

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
