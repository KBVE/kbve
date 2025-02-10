import { getCollection } from 'astro:content';

export const GET = async () => {
    const promptCollection = await getCollection('docs');

    const promptEntries = promptCollection.filter(
        entry => entry.data.sprite && entry.data.sprite.length > 0
    );

    const key = {};
    promptEntries.forEach(entry => {
        entry.data.sprite.forEach(prompt => {
            if (prompt.id && prompt.spriteName) {
                const promptWithSlug = {
                    ...prompt,
                    slug: entry.slug,
                };
                key[prompt.id] = promptWithSlug;
                key[prompt.spriteName] = promptWithSlug;
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