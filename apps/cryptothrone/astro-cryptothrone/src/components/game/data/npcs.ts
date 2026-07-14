import type { NPCData, DialogueNode, NPCAction } from '../types';
import type { Npc } from './npcdb';
import { getNpcEntry, isHostileRef, getGreetingLine } from './npcdb';

// Re-exported so existing scene code keeps importing it from `./npcs`.
export { isHostileRef };

// Per-ref avatar fallback for npcdb entries that ship without an `img`. Real
// art lives on the npcdb entry; this only backfills.
const REF_AVATARS: Record<string, string> = {
	'crystal-bat': '/assets/entity/bird_original.png',
};

const DEFAULT_AVATAR = '/assets/entity/monks.png';

// Built lazily from the npcdb pool — no hardcoded NPC list; every NPC the game
// surfaces resolves through the shared npcdb barrel.
const npcMap = new Map<string, NPCData>();

export function npcIdForRef(ref: string): string {
	return `npc_${ref}`;
}

export function getNpcDbEntry(ref: string): Npc | undefined {
	return getNpcEntry(ref);
}

/** Derive the interaction verbs from npcdb faction + tags. */
function deriveActions(entry: Npc): NPCAction[] {
	if (entry.faction?.faction_id === 'hostile') return ['inspect'];
	const actions: NPCAction[] = ['talk', 'inspect'];
	if (entry.tags?.includes('merchant')) actions.push('trade', 'steal');
	return actions;
}

function buildNpcFromDb(ref: string): NPCData | undefined {
	const entry = getNpcEntry(ref);
	if (!entry) return undefined;
	const npc: NPCData = {
		id: npcIdForRef(ref),
		name: entry.name,
		avatar: entry.img ?? REF_AVATARS[ref] ?? DEFAULT_AVATAR,
		slug: `npc/${ref}`,
		actions: deriveActions(entry),
	};
	npcMap.set(npc.id, npc);
	return npc;
}

export function getNPCById(id: string): NPCData | undefined {
	const known = npcMap.get(id);
	if (known) return known;
	if (id.startsWith('npc_')) return buildNpcFromDb(id.slice(4));
	return undefined;
}

export function getNPCByRef(ref: string): NPCData | undefined {
	return getNPCById(npcIdForRef(ref));
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

function buildDialogueFromDb(ref: string): DialogueNode | undefined {
	const entry = getNpcEntry(ref);
	if (!entry) return undefined;
	const id = `dlg_${ref}_greeting`;
	const dialogue: DialogueNode = {
		id,
		title: entry.name,
		message:
			getGreetingLine(ref) ||
			entry.description?.trim() ||
			`${entry.name} has nothing to say right now.`,
	};
	DIALOGUES[id] = dialogue;
	return dialogue;
}

export function getDialogueById(id: string): DialogueNode | undefined {
	const known = DIALOGUES[id];
	if (known) return known;
	const match = id.match(/^dlg_(.+)_greeting$/);
	if (match) return buildDialogueFromDb(match[1]);
	return undefined;
}

export function getGreetingDialogueId(npcId: string): string {
	if (npcId === 'npc_barkeep') return 'dlg_barkeep_greeting';
	if (npcId === 'npc_monk') return 'dlg_monk_greeting';
	return `dlg_${npcId.replace(/^npc_/, '')}_greeting`;
}
