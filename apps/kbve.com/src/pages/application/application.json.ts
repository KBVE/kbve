import { getCollection } from 'astro:content';


export const GET = async () => {
    const crypto = await getCollection('crypto');

    const cryptoEntries = crypto.map((entry) => [
        entry.slug, // Use entry.slug as the key
        {
            params: {
                id: entry.slug,
            },
            props: {
                entry,
            },
        },
    ]);
    const cryptoObject = Object.fromEntries(cryptoEntries);


    return new Response(
        JSON.stringify(cryptoObject),  {
            headers: {
              'Content-Type': 'application/json',
            },
          }
      )
}
