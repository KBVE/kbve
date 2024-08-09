import { getCollection } from 'astro:content';

export const GET = async () => {
    const mapdbCollection = await getCollection('docs');

    const mapdbEntries = mapdbCollection.filter(
        entry => entry.data.mapdb && entry.data.mapdb.length > 0
    );

    const key = {};
    mapdbEntries.forEach(entry => {
        entry.data.mapdb.forEach(mapdb => {
            if (mapdb.tilemapKey) {
                const mapdbWithSlug = {
                    ...mapdb,
                    slug: entry.slug,
                };
                key[mapdb.tilemapKey] = mapdbWithSlug;
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