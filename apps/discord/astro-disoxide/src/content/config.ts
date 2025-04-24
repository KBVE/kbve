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

export const DiscordServerSchema = z.object({
	server_id: z.string(),
	owner_id: z.string(),
	lang: z.number(),
	status: z.number(),
	invite: z.string(),
	name: z.string(),
	summary: z.string(),
	description: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
	logo: z.string().nullable().optional(),
	banner: z.string().nullable().optional(),
	video: z.string().nullable().optional(),
	categories: z.number(),
	updated_at: z.string(),
})

export type DiscordServer = z.infer<typeof DiscordServerSchema>

export const DiscordTagSchema = z.object({
	tag_id: z.string(),
	name: z.string(),
	status: z.number(),
})

export type DiscordTag = z.infer<typeof DiscordTagSchema>

export const ProfileSchema = z.object({
	profile_id: z.string(),
	user_id: z.string(),
	username: z.string(),
	avatar: z.string().url().optional(),
	bio: z.string().optional(),
	joined_at: z.string(),
	status: z.number(),
})

export type Profile = z.infer<typeof ProfileSchema>


export const collections = {
  guides,
  applications,
  memes,
  blog,
  sidebar,

};