import { z } from 'zod';

// Socials schema
export const socialsSchema = z.object({
	twitter: z.string().url().regex(/^https:\/\/(www\.)?twitter.com\/[a-zA-Z0-9_]{1,15}\/?$/).optional(),
	github: z.string().url().regex(/^https:\/\/(www\.)?github.com\/[a-zA-Z0-9_-]+\/?$/).optional(),
	linkedin: z.string().url().regex(/^https:\/\/(www\.)?linkedin.com\/in\/[a-zA-Z0-9_-]+\/?$/).optional(),
	website: z.string().url().optional(),
}).partial();

// Style schema
export const styleSchema = z.object({
	colors: z.array(z.string().regex(/^#[A-Fa-f0-9]{8}$/)).max(10).optional(),
	cover: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
	background: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).partial();
