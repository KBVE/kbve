import type { NPCData, DialogueNode } from '../types';

const NPCS: NPCData[] = [
	{
		id: 'npc_barkeep',
		name: 'Evee The BarKeep',
		avatar: '/assets/npc/barkeep.webp',
		slug: 'npc/barkeep',
		actions: ['talk', 'trade', 'steal'],
	},
	{
		id: 'npc_monk',
		name: 'Elder Monk',
		avatar: '/assets/entity/monks.png',
		slug: 'npc/monk',
		actions: ['talk', 'inspect'],
	},
];

const npcMap = new Map(NPCS.map((n) => [n.id, n]));

export function getNPCById(id: string): NPCData | undefined {
	return npcMap.get(id);
}

const DIALOGUES: Record<string, DialogueNode> = {
	dlg_barkeep_greeting: {
		id: 'dlg_barkeep_greeting',
		title: 'Greeting',
		message: 'Welcome to the tavern, traveler! What can I get you today?',
		backgroundImage: '/assets/background/animebar.webp',
		options: [
			{
				id: 'opt_about',
				title: 'Tell me about Cloud City',
				nextDialogueId: 'dlg_barkeep_about',
			},
			{
				id: 'opt_trade',
				title: 'What do you have for sale?',
				nextDialogueId: 'dlg_barkeep_trade',
			},
		],
	},
	dlg_barkeep_about: {
		id: 'dlg_barkeep_about',
		title: 'About Cloud City',
		playerResponse: 'Tell me about Cloud City.',
		message:
			'Cloud City floats above the old kingdoms. Beware the birds — they are not what they seem. The tombstone near the plaza holds secrets of Samson the Great.',
		backgroundImage: '/assets/background/animebar.webp',
		options: [
			{
				id: 'opt_back',
				title: 'Thanks for the info',
				nextDialogueId: 'dlg_barkeep_greeting',
			},
		],
	},
	dlg_barkeep_trade: {
		id: 'dlg_barkeep_trade',
		title: 'Trade',
		playerResponse: 'What do you have for sale?',
		message:
			"I've got potions, fresh fish, and the occasional rare item. Check back often — my stock changes with the tides.",
		backgroundImage: '/assets/background/animebar.webp',
		options: [
			{
				id: 'opt_back2',
				title: "I'll think about it",
				nextDialogueId: 'dlg_barkeep_greeting',
			},
		],
	},
	dlg_monk_greeting: {
		id: 'dlg_monk_greeting',
		title: 'Meditation',
		message:
			'Peace, traveler. The path to the throne is long. Patience and wisdom will serve you well.',
	},
};

export function getDialogueById(id: string): DialogueNode | undefined {
	return DIALOGUES[id];
}
