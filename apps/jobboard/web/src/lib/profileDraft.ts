import { z } from 'zod';
import { ProfileDraftSchema, ProfileLinkSchema } from '../api/types';

// The generated ProfileDraftSchema (proto -> zod) is the *shape* contract: field
// names, the kind enum, types. The SQL CHECK (is_valid_profile_draft,
// packages/data/sql/dbmate/migrations/20260617200000_jobboard_profile_details.sql)
// adds the business rules proto can't express -- https-only urls, max lengths,
// ranges, no unknown keys. This extends the generated schema with those rules so
// the client pre-flight matches what the DB will accept; the SQL CHECK stays the
// source of truth. (web and the codegen bundle are pinned to the same zod so the
// generated schema can be extended directly -- v4 brands its internal version.)

export const LINK_KINDS = ProfileLinkSchema.shape.kind.options;

const httpsUrl = z
	.string()
	.trim()
	.regex(/^https:\/\//i, { message: 'Must be an https:// URL' })
	.max(2048, { message: 'URL too long' });

export const profileLinkCheck = ProfileLinkSchema.extend({
	url: httpsUrl,
}).strict();

export const profileDraftSchema = ProfileDraftSchema.extend({
	headline: z.string().max(200).optional(),
	bio: z.string().max(5000).optional(),
	years_experience: z.number().int().min(0).max(100).optional(),
	location: z.string().max(120).optional(),
	links: z.array(profileLinkCheck).max(20).optional(),
	discipline_ids: z.array(z.number().int().positive()).max(20).optional(),
}).strict();

export type ProfileDraftChecked = z.infer<typeof profileDraftSchema>;
