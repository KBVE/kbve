import { z } from 'zod';
import { ProfileLinkSchema } from '../api/types';

// The generated ProfileDraftSchema (proto -> zod) is the *shape* contract: field
// names, the kind enum, types. The SQL CHECK (is_valid_profile_draft,
// packages/data/sql/dbmate/migrations/20260617200000_jobboard_profile_details.sql)
// adds the business rules proto can't express -- https-only urls, max lengths,
// ranges, no unknown keys. This pre-flight mirrors the SQL CHECK so a bad shape
// surfaces on the client instead of as a server rejection; the SQL stays the
// source of truth. (Authored against the workspace zod rather than extending the
// generated schema directly: the codegen bundle pins a different zod minor, and
// v4 brands its internal version so cross-version composition won't typecheck.)

export const LINK_KINDS = ProfileLinkSchema.shape.kind.options;

const httpsUrl = z
	.string()
	.trim()
	.regex(/^https:\/\//i, { message: 'Must be an https:// URL' })
	.max(2048, { message: 'URL too long' });

export const profileLinkCheck = z
	.object({ kind: z.enum(LINK_KINDS), url: httpsUrl })
	.strict();

export const profileDraftSchema = z
	.object({
		headline: z.string().max(200).optional(),
		bio: z.string().max(5000).optional(),
		years_experience: z.number().int().min(0).max(100).optional(),
		location: z.string().max(120).optional(),
		links: z.array(profileLinkCheck).max(20).optional(),
		discipline_ids: z.array(z.number().int().positive()).max(20).optional(),
	})
	.strict();

export type ProfileDraftChecked = z.infer<typeof profileDraftSchema>;
