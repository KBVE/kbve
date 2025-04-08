import { z, defineCollection } from 'astro:content';

const baseSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  date: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const guides = defineCollection({ schema: baseSchema });
const applications = defineCollection({ schema: baseSchema });
const memes = defineCollection({ schema: baseSchema });
const blog = defineCollection({ schema: baseSchema });

export const collections = {
  guides,
  applications,
  memes,
  blog,
};