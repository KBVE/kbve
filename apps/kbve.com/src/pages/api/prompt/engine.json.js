import { getCollection } from 'astro:content';

export const GET = async () => {
    const promptCollection = await getCollection('docs');

    const promptEntries = promptCollection.filter(
        entry => entry.data.prompts && entry.data.prompts.length > 0
    );

    const key = {};
    promptEntries.forEach(entry => {
        entry.data.prompts.forEach(prompt => {
            if (prompt.ulid) {
                key[prompt.ulid] = prompt;
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