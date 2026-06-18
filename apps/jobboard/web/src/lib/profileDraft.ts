import { z } from 'zod';
import { ProfileDraftSchema, ProfileLinkSchema } from '../api/types';

// The generated ProfileDraftSchema (proto -> zod) is the *shape* contract: field
// names, the kind enum, types. The SQL CHECK (is_valid_profile_draft,
// packages/data/sql/dbmate/migrations/20260617200000_jobboard_profile_details.sql
// + the host lock in 20260618000000_jobboard_link_host_lock.sql) adds the
// business rules proto can't express -- https-only urls, per-kind host locks, max
// lengths, ranges, no unknown keys. This extends the generated schema with those
// rules so the client pre-flight matches what the DB will accept; the SQL CHECK
// stays the source of truth. (web and the codegen bundle are pinned to the same
// zod so the generated schema can be extended directly -- v4 brands its version.)

export const LINK_KINDS = ProfileLinkSchema.shape.kind.options;

// Per-kind host lock. A kind absent here (website/other) accepts any https host.
// Apex + subdomains are allowed (user.itch.io, gist.github.com).
const ALLOWED_HOSTS: Partial<Record<(typeof LINK_KINDS)[number], string[]>> = {
	github: ['github.com'],
	linkedin: ['linkedin.com'],
	itch: ['itch.io'],
	artstation: ['artstation.com'],
	x: ['x.com', 'twitter.com'],
};

export function hostMessage(kind: string): string {
	const hosts = ALLOWED_HOSTS[kind as (typeof LINK_KINDS)[number]];
	return hosts
		? `${kind} link must be on ${hosts.join(' or ')}`
		: 'Invalid URL';
}

export function hostOk(kind: string, url: string): boolean {
	const allowed = ALLOWED_HOSTS[kind as (typeof LINK_KINDS)[number]];
	if (!allowed) return true;
	let host: string;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

const httpsUrl = z
	.string()
	.trim()
	.regex(/^https:\/\//i, { message: 'Must be an https:// URL' })
	.max(2048, { message: 'URL too long' });

export const profileLinkCheck = ProfileLinkSchema.extend({ url: httpsUrl })
	.strict()
	.superRefine((link, ctx) => {
		if (!hostOk(link.kind, link.url)) {
			ctx.addIssue({
				code: 'custom',
				path: ['url'],
				message: hostMessage(link.kind),
			});
		}
	});

export const profileDraftSchema = ProfileDraftSchema.extend({
	headline: z.string().max(200).optional(),
	bio: z.string().max(5000).optional(),
	years_experience: z.number().int().min(0).max(100).optional(),
	location: z.string().max(120).optional(),
	links: z.array(profileLinkCheck).max(20).optional(),
	discipline_ids: z.array(z.number().int().positive()).max(20).optional(),
}).strict();

export type ProfileDraftChecked = z.infer<typeof profileDraftSchema>;
