import { getCollection } from 'astro:content';

export const GET = async () => {
    const promptCollection = await getCollection('docs');

    const promptEntries = promptCollection.filter(
        entry => entry.data.itemdb && entry.data.itemdb.length > 0
    );

    const key = {};
    promptEntries.forEach(entry => {
        entry.data.itemdb.forEach(prompt => {
            if (prompt.id && prompt.name) {
                const promptWithSlug = {
                    ...prompt,
                    slug: entry.slug,
                };
                key[prompt.id] = promptWithSlug;
                key[prompt.name] = promptWithSlug;
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