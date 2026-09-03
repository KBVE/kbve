import { loadNpcs, getNpc, type Npc, type NpcStats } from '@kbve/npcdb';

// cryptothrone's view of the shared npcdb. There is ONE npcdb type — the
// proto-generated `Npc` from the @kbve/npcdb barrel; this module only adds the
// thin, game-specific lookups cryptothrone needs. No bespoke NPC type lives
// here anymore.

export type { Npc, NpcStats } from '@kbve/npcdb';

export function getNpcEntry(ref: string): Npc | undefined {
	return getNpc(ref);
}

export function getAllNpcEntries(): Npc[] {
	return loadNpcs();
}

export function getNpcStats(ref: string): NpcStats | undefined {
	return getNpc(ref)?.stats;
}

export function isHostileRef(ref: string): boolean {
	return getNpc(ref)?.faction?.faction_id === 'hostile';
}

/** First greeting line authored on the npcdb entry, if any. */
export function getGreetingLine(ref: string): string | undefined {
	const greeting = getNpc(ref)?.dialogue?.find(
		(d) => d.trigger === 'greeting',
	);
	return greeting?.lines?.[0];
}
