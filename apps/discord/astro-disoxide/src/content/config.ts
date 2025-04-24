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

// * i18n


export const sidebarSchema = z.object({
  dashboard: z.string(),
  servers: z.string(),
  logs: z.string(),
  settings: z.string(),
  logout: z.string(),
  welcome: z.string(),
});

const sidebar = defineCollection({ schema: sidebarSchema });



export const collections = {
  guides,
  applications,
  memes,
  blog,
  sidebar,
};