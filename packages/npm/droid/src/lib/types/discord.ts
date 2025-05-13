import { z } from 'zod';

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
});

export type DiscordServer = z.infer<typeof DiscordServerSchema>;

export const DiscordTagSchema = z.object({
	tag_id: z.string(),
	name: z.string(),
	status: z.number(),
});

export type DiscordTag = z.infer<typeof DiscordTagSchema>;

export const ProfileSchema = z.object({
	profile_id: z.string(),
	user_id: z.string(),
	username: z.string(),
	avatar: z.string().url().optional(),
	bio: z.string().optional(),
	joined_at: z.string(),
	status: z.number(),
});

export type Profile = z.infer<typeof ProfileSchema>;
