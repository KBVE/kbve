import { z, defineCollection } from 'astro:content';

//*         [Applications]
const application = defineCollection({
    schema: z.object({
      title: z.string(),
      description: z.string(),
      tags: z.array(z.string()), 
      footnote: z.string().optional(),
      author: z.string().default('KBVE Team'),
      unsplash: z.string().default(''),
      img: z.string().default(''),
      date: z.string().optional(),
      url: z.string().optional(),
      information: z.string().optional(),
      media: z.any().optional(),
    }),
  });
  

//*         [Assets]

//?         {Crypto}
const crypto = defineCollection({
    schema: z.object({
      ticker: z.string(),
      title: z.string(),
      description: z.string(),
      isin: z.string().optional(),
      cusip: z.string().optional(),
      exchange: z.string(),
      tags: z.array(z.string()), 
      footnote: z.string().optional(),
      author: z.string().default('KBVE Team'),
      unsplash: z.string().default(''),
      img: z.string().default(''),
      date: z.string().optional(),
      url: z.string().optional(),
    }),
  });


//*         [Blog]

//?         {Journal}
const journal = defineCollection({
    schema: z.object({
      title: z.string(),
      description: z.string(),
      tags: z.array(z.string()), 
      footnote: z.string().optional(),
      author: z.string().default('KBVE Team'),
      unsplash: z.string().default(''),
      img: z.string().default(''),
      date: z.date().optional(),
      url: z.string().optional(),
    }),
  });


export const collections = {

    //*     [Applications]
    application: application,

    //*     [Assets]
    crypto: crypto,

    //*     [Blog]
    journal: journal,

}