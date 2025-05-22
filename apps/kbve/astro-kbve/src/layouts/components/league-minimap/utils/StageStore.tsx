/** @jsxImportSource react */
import { atom } from 'nanostores';
import { STAGES } from './StageTypes';
import type { Stage, StageDefinitions, StageDefinition } from './StageTypes';


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
    title: 'Welcome to KBVE',
    subtitle: 'Explore our interactive map or read more about our vision.',
    buttonText: 'Read More >',
    badge: 'Intro',
    features: ['Vision Overview', 'Mission Statement'],
  },
  map: {
    bg: 'https://images.unsplash.com/photo-1576173992415-e0ca34dc0a8a?q=80&w=3540&auto=format&fit=crop&',
    shape: 'K',
    title: 'Explore the Map',
    subtitle: 'Interactive zones and regions of the League.',
    buttonText: 'See Map',
    badge: 'Map View',
    features: ['Dynamic Zones', 'Zoom + Pan', 'Points of Interest'],
  },
  home: {
    bg: 'https://images.unsplash.com/photo-1693712001391-6aaab1f53d29?q=80&w=3540&auto=format&fit=crop&',
    shape: 'K',
    title: 'Return Home',
    subtitle: 'Your central hub for everything KBVE.',
    buttonText: 'Return Home',
    badge: 'Main Hub',
  },
  about: {
    bg: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?q=80&w=3540&auto=format&fit=crop&',
    shape: 'K',
    title: 'About KBVE',
    subtitle: 'Learn more about our mission, tech, and future.',
    buttonText: 'Learn More',
    badge: 'About Us',
  }
};
