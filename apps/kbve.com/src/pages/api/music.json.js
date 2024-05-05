import { getCollection } from 'astro:content';

export const GET = async () => {
    const musiccollection = await getCollection('docs');

    // Filter entries with the "music" tag
    const musicEntries = musiccollection.filter(entry => 
        Array.isArray(entry.data.tags) && entry.data.tags.includes('music')
    );

    const items = musicEntries.map(entry => ({
        id: entry.slug,
        name: entry.data.title,
        description: entry.data.description,
        tags: entry.data.tags,
        ytTracks: entry.data['yt-tracks'] || [],
        ytSets: entry.data['yt-sets'] || [],
    }));

    // Creating the response object
    const responseData = { items };

    return new Response(JSON.stringify(responseData), {
        headers: {
            'Content-Type': 'application/json',
        },
    });
};
