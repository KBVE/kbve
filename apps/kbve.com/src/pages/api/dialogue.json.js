import { getCollection } from 'astro:content';

export const GET = async () => {
    const dialogueCollection = await getCollection('docs');

    const dataEntries = dialogueCollection.filter(
        entry => entry.data.dialogue && entry.data.dialogue.length > 0
    );

    const key = {};
    dataEntries.forEach(entry => {
        entry.data.npcdb.forEach(_dialogue => {
            if (_dialogue.id) {
                const _dialogueWithSlug = {
                    ..._dialogue,
                    slug: entry.slug,
                };
                key[_dialogue.id] = _dialogueWithSlug;
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