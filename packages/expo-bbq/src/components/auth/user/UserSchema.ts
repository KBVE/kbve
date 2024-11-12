import { z } from 'zod';

// Socials schema
export const socialsSchema = z.object({
	twitter: z.string().url().regex(/^https:\/\/(www\.)?twitter.com\/[a-zA-Z0-9_]{1,15}\/?$/).optional().or(z.literal('')),
	github: z.string().url().regex(/^https:\/\/(www\.)?github.com\/[a-zA-Z0-9_-]+\/?$/).optional().or(z.literal('')),
	linkedin: z.string().url().regex(/^https:\/\/(www\.)?linkedin.com\/in\/[a-zA-Z0-9_-]+\/?$/).optional().or(z.literal('')),
	website: z.string().url().optional().or(z.literal('')),
}).optional();

// Style schema
export const styleSchema = z.object({
	colors: z.array(z.string().regex(/^#[A-Fa-f0-9]{8}$/)).max(10).optional(),
	cover: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
	background: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
}).optional();

// User card schema combining bio, socials, and style
export const userCardSchema = z.object({
	bio: z.string().max(255).optional(),
	socials: socialsSchema.optional(),
	style: styleSchema.optional(),
});