import { getCollection } from 'astro:content';

export const GET = async () => {

    const promptCollection = await getCollection('docs');

    const promptEntries = promptCollection.filter(
        entry => entry.data["prompt-index"]
    );

    const prompts = promptEntries.map(entry => ({
        id: entry.data["prompt-index"],
        prompts: entry.data.prompts,
    }));

    const responseData = { prompts };

    return new Response(JSON.stringify(responseData), {
        headers: {
            'Content-Type': 'application/json',
        },
    });

}