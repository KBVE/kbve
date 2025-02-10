import { getCollection } from 'astro:content';

export const GET = async () => {
    const npcCollection = await getCollection('docs');

    const dataEntries = npcCollection.filter(
        entry => entry.data.npcdb && entry.data.npcdb.length > 0
    );

    const key = {};
    dataEntries.forEach(entry => {
        entry.data.npcdb.forEach(_npc => {
            if (_npc.id && _npc.name) {
                const _npcWithSlug = {
                    ..._npc,
                    slug: entry.slug,
                };
                key[_npc.id] = _npcWithSlug;
                key[_npc.name] = _npcWithSlug;
            }
        });
    });

    const responseData = { key };

    return new Response(JSON.stringify(responseData), {
        headers: {
            'Content-Type': 'application/json',
        },
    });
};