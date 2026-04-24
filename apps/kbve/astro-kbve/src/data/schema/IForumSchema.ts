/**
 * Astro content collection + API wrappers for forum entries.
 *
 * Proto-derived schemas come from
 * packages/data/codegen/generated/forum-schema.ts (source of truth).
 * Identity fields (username, avatar, linked providers) live in
 * kbve.profile.UserProfile — not duplicated here. Forum-side state
 * (karma, post count, flair, signature, rank, badges) lives in
 * ForumUserProfile, keyed by the same Supabase user_id.
 */
import { z } from 'zod';
import {
	// Core entities
	ForumSpaceSchema,
	ForumTagSchema,
	ForumThreadSchema,
	ForumCommentSchema,
	ForumUserProfileSchema,
	ForumAuctionBidSchema,
	ForumPollVoteSchema,

	// Votes + reactions
	ThreadVoteSchema,
	CommentVoteSchema,
	ReactionSchema,

	// Relationships
	ThreadTagSchema,
	UserFollowSchema,
	BookmarkSchema,
	ThreadSubscriptionSchema,

	// Moderation
	ReportSchema,
	ModerationActionSchema,

	// Delivery
	NotificationSchema,
	AttachmentSchema,

	// Type-specific metadata
	DiscussionDataSchema,
	QuestionDataSchema,
	AnnouncementDataSchema,
	MarketplaceDataSchema,
	AuctionDataSchema,
	PollDataSchema,
	LfgDataSchema,
	AssetDataSchema,
	StatusDataSchema,

	// Aggregates
	FeedItemSchema,
	SpacePageSchema,
	ThreadPageSchema,
	UserPageSchema,

	// Enum const arrays + schemas
	ThreadStatuses,
	ThreadStatusSchema,
	CommentStatuses,
	CommentStatusSchema,
	ThreadTypes,
	ThreadTypeSchema,
	SpaceStatuses,
	SpaceStatusSchema,
	TagStatuses,
	TagStatusSchema,
	VoteDirections,
	VoteDirectionSchema,
	ReactionKinds,
	ReactionKindSchema,
	ReportReasons,
	ReportReasonSchema,
	ModerationActionKinds,
	ModerationActionKindSchema,
	NotificationKinds,
	NotificationKindSchema,
	FollowTargetKinds,
	FollowTargetKindSchema,
	AttachmentParentKinds,
	AttachmentParentKindSchema,
	AttachmentKinds,
	AttachmentKindSchema,
	LfgStatuses,
	LfgStatusSchema,
} from '../../../../../../packages/data/codegen/generated/forum-schema';

// ---------------------------------------------------------------------------
// Re-exports — callers import everything through `@/data/schema`.
// ---------------------------------------------------------------------------

export {
	ForumSpaceSchema,
	ForumTagSchema,
	ForumThreadSchema,
	ForumCommentSchema,
	ForumUserProfileSchema,
	ForumAuctionBidSchema,
	ForumPollVoteSchema,
	ThreadVoteSchema,
	CommentVoteSchema,
	ReactionSchema,
	ThreadTagSchema,
	UserFollowSchema,
	BookmarkSchema,
	ThreadSubscriptionSchema,
	ReportSchema,
	ModerationActionSchema,
	NotificationSchema,
	AttachmentSchema,
	DiscussionDataSchema,
	QuestionDataSchema,
	AnnouncementDataSchema,
	MarketplaceDataSchema,
	AuctionDataSchema,
	PollDataSchema,
	LfgDataSchema,
	AssetDataSchema,
	StatusDataSchema,
	FeedItemSchema,
	SpacePageSchema,
	ThreadPageSchema,
	UserPageSchema,
	ThreadStatuses,
	ThreadStatusSchema,
	CommentStatuses,
	CommentStatusSchema,
	ThreadTypes,
	ThreadTypeSchema,
	SpaceStatuses,
	SpaceStatusSchema,
	TagStatuses,
	TagStatusSchema,
	VoteDirections,
	VoteDirectionSchema,
	ReactionKinds,
	ReactionKindSchema,
	ReportReasons,
	ReportReasonSchema,
	ModerationActionKinds,
	ModerationActionKindSchema,
	NotificationKinds,
	NotificationKindSchema,
	FollowTargetKinds,
	FollowTargetKindSchema,
	AttachmentParentKinds,
	AttachmentParentKindSchema,
	AttachmentKinds,
	AttachmentKindSchema,
	LfgStatuses,
	LfgStatusSchema,
};

export type {
	ForumSpace,
	ForumTag,
	ForumThread,
	ForumComment,
	ForumUserProfile,
	ForumAuctionBid,
	ForumPollVote,
	ThreadVote,
	CommentVote,
	Reaction,
	ThreadTag,
	UserFollow,
	Bookmark,
	ThreadSubscription,
	Report,
	ModerationAction,
	Notification,
	Attachment,
	DiscussionData,
	QuestionData,
	AnnouncementData,
	MarketplaceData,
	AuctionData,
	PollData,
	LfgData,
	AssetData,
	StatusData,
	FeedItem,
	SpacePage,
	ThreadPage,
	UserPage,
	ThreadStatusValue,
	CommentStatusValue,
	ThreadTypeValue,
	SpaceStatusValue,
	TagStatusValue,
	VoteDirectionValue,
	ReactionKindValue,
	ReportReasonValue,
	ModerationActionKindValue,
	NotificationKindValue,
	FollowTargetKindValue,
	AttachmentParentKindValue,
	AttachmentKindValue,
	LfgStatusValue,
} from '../../../../../../packages/data/codegen/generated/forum-schema';

// ---------------------------------------------------------------------------
// Request / response shapes used by axum-kbve forum endpoints.
//
// Proto is the source of truth for persisted shapes; these are the
// write-path payloads the frontend submits. Server-set fields (id, author_id,
// timestamps, denormalized counters, score) are stripped from the input.
// ---------------------------------------------------------------------------

/** Server-set fields omitted from thread create payloads. */
const THREAD_SERVER_FIELDS = [
	'id',
	'author_id',
	'status',
	'comment_count',
	'view_count',
	'created_at',
	'updated_at',
	'edited_at',
	'score',
	'upvote_count',
	'downvote_count',
	'last_activity_at',
	'locked',
	'revision_count',
	'attachment_count',
	'accepted_comment_id',
	'slug',
	'pinned',
] as const;

/** Create-thread payload — no server fields, no oneof wiring (client picks type_data branch inline). */
export const CreateThreadRequestSchema = ForumThreadSchema.omit(
	Object.fromEntries(THREAD_SERVER_FIELDS.map((k) => [k, true])) as Record<
		(typeof THREAD_SERVER_FIELDS)[number],
		true
	>,
).extend({
	/** Tag IDs resolved on server to canonical_id via thread_tags_resolved view. */
	tag_ids: z.array(z.number().int().positive()).max(10).default([]),
});
export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;

/** Update-thread payload — only the author-editable fields. */
export const UpdateThreadRequestSchema = z.object({
	title: ForumThreadSchema.shape.title.optional(),
	body: ForumThreadSchema.shape.body.optional(),
	nsfw: z.boolean().optional(),
	tag_ids: z.array(z.number().int().positive()).max(10).optional(),
	// Per-type metadata updates are merged into the existing oneof branch.
	discussion_data: DiscussionDataSchema.optional(),
	question_data: QuestionDataSchema.optional(),
	announcement_data: AnnouncementDataSchema.optional(),
	marketplace_data: MarketplaceDataSchema.optional(),
	auction_data: AuctionDataSchema.optional(),
	poll_data: PollDataSchema.optional(),
	lfg_data: LfgDataSchema.optional(),
	asset_data: AssetDataSchema.optional(),
	status_data: StatusDataSchema.optional(),
});
export type UpdateThreadRequest = z.infer<typeof UpdateThreadRequestSchema>;

const COMMENT_SERVER_FIELDS = [
	'id',
	'author_id',
	'status',
	'depth',
	'is_accepted',
	'created_at',
	'edited_at',
	'score',
	'upvote_count',
	'downvote_count',
	'revision_count',
	'attachment_count',
] as const;

/** Create-comment payload. Depth is derived server-side from parent_comment_id. */
export const CreateCommentRequestSchema = ForumCommentSchema.omit(
	Object.fromEntries(COMMENT_SERVER_FIELDS.map((k) => [k, true])) as Record<
		(typeof COMMENT_SERVER_FIELDS)[number],
		true
	>,
);
export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;

/** Cast / update / retract a vote. `direction = cleared` retracts an existing vote. */
export const CastVoteRequestSchema = z.object({
	target_kind: z.enum(['thread', 'comment']),
	target_id: z.string().min(1),
	direction: VoteDirectionSchema,
});
export type CastVoteRequest = z.infer<typeof CastVoteRequestSchema>;

/** Toggle a reaction on or off. */
export const ToggleReactionRequestSchema = z.object({
	target_kind: AttachmentParentKindSchema,
	target_id: z.string().min(1),
	kind: ReactionKindSchema,
	/** Only meaningful when kind = "custom". */
	custom_kind: z.string().max(50).optional(),
});
export type ToggleReactionRequest = z.infer<typeof ToggleReactionRequestSchema>;

/** Bookmark a thread. */
export const CreateBookmarkRequestSchema = z.object({
	thread_id: z.string().min(1),
	folder: z.string().max(100).optional(),
	note: z.string().max(500).optional(),
});
export type CreateBookmarkRequest = z.infer<typeof CreateBookmarkRequestSchema>;

/** Follow a user, space, or tag. */
export const FollowRequestSchema = z.object({
	target_kind: FollowTargetKindSchema,
	target_id: z.string().min(1),
	notifications_enabled: z.boolean().default(true),
});
export type FollowRequest = z.infer<typeof FollowRequestSchema>;

/** File a report. */
export const FileReportRequestSchema = z.object({
	target_kind: AttachmentParentKindSchema,
	target_id: z.string().min(1),
	reason: ReportReasonSchema,
	reason_detail: z.string().max(2000).optional(),
});
export type FileReportRequest = z.infer<typeof FileReportRequestSchema>;

/** Feed sort order, used by feed + space-page endpoints. */
export const FeedSortSchema = z.enum([
	'hot',
	'new',
	'top',
	'rising',
	'controversial',
	'bump',
]);
export type FeedSort = z.infer<typeof FeedSortSchema>;

/** Feed query params. */
export const FeedQuerySchema = z.object({
	space_id: z.string().uuid().optional(),
	tag_id: z.number().int().positive().optional(),
	author_id: z.string().uuid().optional(),
	thread_type: ThreadTypeSchema.optional(),
	sort: FeedSortSchema.default('hot'),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(25),
	include_nsfw: z.boolean().default(false),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

/** Paginated feed response. */
export const FeedResponseSchema = z.object({
	items: z.array(FeedItemSchema),
	next_cursor: z.string().optional(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;
