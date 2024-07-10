import { getCollection } from 'astro:content';

export const GET = async () => {
    const avatarCollection = await getCollection('docs');

    const avatarEntries = avatarCollection.filter(
        entry => entry.data.avatar && entry.data.avatar.length > 0
    );

    const key = {};
    avatarEntries.forEach(entry => {
        entry.data.avatar.forEach(_avatar => {
            if (_avatar.id && _avatar.avatarName) {
                const _avatarWithSlug = {
                    ..._avatar,
                    slug: entry.slug,
                };
                key[_avatar.id] = _avatarWithSlug;
                key[_avatar.avatarName] = _avatarWithSlug;
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