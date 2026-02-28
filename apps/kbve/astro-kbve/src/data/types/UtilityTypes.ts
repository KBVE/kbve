import { z } from 'astro:content';

export const ULID = z
	.string()
	.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID');

export const GUID = z.string().regex(/^[a-f0-9]{32}$/, 'Invalid GUID');
