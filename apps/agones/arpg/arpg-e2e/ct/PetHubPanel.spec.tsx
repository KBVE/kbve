import { test, expect } from '@playwright/experimental-ct-react';
import type { PetRosterSync } from '@kbve/laser';
import { PetHubView } from '../../web/src/game/ui/pets/PetHub';
import { PetHubProbe } from './PetHubProbe';

const roster: PetRosterSync = {
	pets: [
		{
			id: '01J',
			species_ref: 'mechamutt',
			nickname: 'Rex',
			level: 5,
			xp: 120,
			hp: 30,
			max_hp: 40,
			attack: 12,
			defense: 10,
			sp_attack: 14,
			sp_defense: 11,
			speed: 13,
			moves: [{ ability_id: 'spark', pp: 9, max_pp: 15 }],
		},
		{
			id: '01K',
			species_ref: 'mechamutt',
			nickname: 'Bolt',
			level: 7,
			xp: 0,
			hp: 44,
			max_hp: 44,
			attack: 15,
			defense: 12,
			sp_attack: 16,
			sp_defense: 13,
			speed: 17,
			moves: [],
		},
	],
	active: 0,
};

test('renders the party, the lead badge, and the selected pet stats', async ({
	mount,
}) => {
	const component = await mount(
		<PetHubView roster={roster} onOp={() => {}} onClose={() => {}} />,
	);
	await expect(component.getByText('Rex').first()).toBeVisible();
	await expect(component.getByText('Bolt')).toBeVisible();
	// `exact` matters: a loose match also hits the "Make lead" / "Lead" button.
	await expect(component.getByText('LEAD', { exact: true })).toBeVisible();
	// The detail pane defaults to the first pet: its move PP and stat block.
	await expect(component.getByText('spark')).toBeVisible();
	await expect(component.getByText('9/15 PP')).toBeVisible();
	await expect(component.getByText('Speed')).toBeVisible();
});

test('shows a loading state until the first sync lands', async ({ mount }) => {
	const component = await mount(
		<PetHubView roster={null} onOp={() => {}} onClose={() => {}} />,
	);
	await expect(component.getByText(/Loading roster/)).toBeVisible();
});

test('an empty roster reads as intentional, not broken', async ({ mount }) => {
	const component = await mount(
		<PetHubView
			roster={{ pets: [], active: null }}
			onOp={() => {}}
			onClose={() => {}}
		/>,
	);
	await expect(component.getByText('No pets yet.')).toBeVisible();
});

test('selecting a reserve and making it lead emits the op', async ({
	mount,
}) => {
	const component = await mount(<PetHubProbe roster={roster} />);
	await component.getByRole('button', { name: /Bolt/ }).click();
	await component.getByRole('button', { name: 'Make lead' }).click();
	await expect(component.getByTestId('ops')).toHaveText(
		JSON.stringify([{ kind: 'setActive', idx: 1 }]),
	);
});

test('release requires a confirmation click', async ({ mount }) => {
	const component = await mount(<PetHubProbe roster={roster} />);
	await component.getByRole('button', { name: 'Release' }).click();
	// Arming the confirmation must not emit anything on its own.
	await expect(component.getByTestId('ops')).toHaveText('[]');
	await component.getByRole('button', { name: 'Confirm release' }).click();
	await expect(component.getByTestId('ops')).toHaveText(
		JSON.stringify([{ kind: 'release', idx: 0 }]),
	);
});

test('rename is only offered once the draft differs from the server name', async ({
	mount,
}) => {
	const component = await mount(<PetHubProbe roster={roster} />);
	const rename = component.getByRole('button', { name: 'Rename' });
	await expect(rename).toBeDisabled();
	await component.getByLabel('Nickname').fill('Sparky');
	await rename.click();
	await expect(component.getByTestId('ops')).toHaveText(
		JSON.stringify([{ kind: 'rename', idx: 0, name: 'Sparky' }]),
	);
});
