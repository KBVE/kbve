import { getCollection } from 'astro:content';

export const GET = async () => {
    const servicesCollection = await getCollection('docs');

    // Filter entries with the "stats" tag
    const servicesEntries = servicesCollection.filter(entry => 
        Array.isArray(entry.data.tags) && entry.data.tags.includes('services')
    );

    const items = servicesEntries.map(entry => ({
        id: entry.slug,
        unsplash: entry.data.unsplash,
        name: entry.data.title,
        description: entry.data.description,
        tags: entry.data.tags,
        stats: entry.data['stats'] || [],
    }));

    // Creating the response object
    const responseData = { items };

    return new Response(JSON.stringify(responseData), {
        headers: {
            'Content-Type': 'application/json',
        },
    });
};
