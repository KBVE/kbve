import { getCollection } from 'astro:content';


export const GET = async () => {
    const application = await getCollection('application');

    const applicationEntries = application.map((entry) => [
        entry.slug, 
        {
            id: entry.slug,
            title: entry.data.title,
            description: entry.data.description,
            tags: entry.data.tags,
        },
    ]);
    const applicationObject = Object.fromEntries(applicationEntries);


    return new Response(
        JSON.stringify(applicationObject),  {
            headers: {
              'Content-Type': 'application/json',
            },
          }
      )
}
