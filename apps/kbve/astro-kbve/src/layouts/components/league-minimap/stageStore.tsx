/** @jsxImportSource react */
import { atom } from 'nanostores';
import { STAGES } from './stageTypes';
import type { Stage, StageDefinitions, StageDefinition } from './stageTypes';
import { Shapes } from './Shapes';


export const $stage = atom<Stage>('read');

export function nextStage() {
	const current = $stage.get();
	const idx = STAGES.indexOf(current);
	const next = STAGES[(idx + 1) % STAGES.length];
	$stage.set(next);
}


export function getStageIndex(stage: Stage): number {
	return STAGES.indexOf(stage);
}

export function getStageByIndex(index: number): Stage {
	return STAGES[index]!;
}

export function getNextStage(stage: Stage): Stage {
	return getStageByIndex((getStageIndex(stage) + 1) % STAGES.length);
}


export const stageDefinitions: StageDefinitions = {
	read: {
		bg: 'https://images.unsplash.com/photo-1547700055-b61cacebece9?q=80&w=3540&auto=format&fit=crop&',
		shape: 'K',
		content: (
			<>
				<h1 className="text-4xl font-bold">Welcome to KBVE</h1>
				<p className="text-zinc-300 max-w-xl mx-auto">
					Explore our interactive map or read more about our vision.
				</p>
			</>
		),
		buttonText: 'Read More >',
	},
	map: {
		bg: 'https://images.unsplash.com/photo-1576173992415-e0ca34dc0a8a?q=80&w=3540&auto=format&fit=crop&',
		shape: 'K',
		content: (
			<>
				<h1 className="text-4xl font-bold">Explore the Map</h1>
				<p className="text-zinc-300 max-w-xl mx-auto">
					Interactive map of the League and its zones.
				</p>
			</>
		),
		buttonText: 'See Map',
	},
	home: {
		bg: 'https://images.unsplash.com/photo-1693712001391-6aaab1f53d29?q=80&w=3540&auto=format&fit=crop&',
		shape: 'K',
		content: (
			<>
				<h1 className="text-4xl font-bold">Back Home</h1>
				<p className="text-zinc-300 max-w-xl mx-auto">
					This is your central hub for everything KBVE.
				</p>
			</>
		),
		buttonText: 'Return Home',
	},
	about: {
		bg: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?q=80&w=3540&auto=format&fit=crop&',
		shape: 'K',
		content: (
			<>
				<h1 className="text-4xl font-bold">About KBVE</h1>
				<p className="text-zinc-300 max-w-xl mx-auto">
					Learn more about our mission, tech, and goals.
				</p>
			</>
		),
		buttonText: 'Learn More',
	}
};