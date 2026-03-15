import { z } from 'astro:content';

export const ULID = z
	.string()
	.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid ULID');
