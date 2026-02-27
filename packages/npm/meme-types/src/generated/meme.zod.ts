// AUTO-GENERATED from meme.proto — DO NOT EDIT
// Source: packages/data/proto/meme/meme.proto

import { z } from 'zod';

import { ResultSchema } from '../common.zod';

// ─────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────

export const MemeFormatValues = [
	'MEME_FORMAT_UNSPECIFIED',
	'MEME_FORMAT_IMAGE',
	'MEME_FORMAT_GIF',
	'MEME_FORMAT_VIDEO',
	'MEME_FORMAT_WEBP_ANIM',
] as const;
export const MemeFormatSchema = z.enum(MemeFormatValues);
export type MemeFormat = z.infer<typeof MemeFormatSchema>;

export const MemeStatusValues = [
	'MEME_STATUS_UNSPECIFIED',
	'MEME_STATUS_DRAFT',
	'MEME_STATUS_PENDING',
	'MEME_STATUS_PUBLISHED',
	'MEME_STATUS_REJECTED',
	'MEME_STATUS_ARCHIVED',
	'MEME_STATUS_FLAGGED',
	'MEME_STATUS_BANNED',
] as const;
export const MemeStatusSchema = z.enum(MemeStatusValues);
export type MemeStatus = z.infer<typeof MemeStatusSchema>;

export const ReactionTypeValues = [
	'REACTION_UNSPECIFIED',
	'REACTION_LIKE',
	'REACTION_DISLIKE',
	'REACTION_FIRE',
	'REACTION_SKULL',
	'REACTION_CRY',
	'REACTION_CAP',
] as const;
export const ReactionTypeSchema = z.enum(ReactionTypeValues);
export type ReactionType = z.infer<typeof ReactionTypeSchema>;

export const MemeRarityValues = [
	'MEME_RARITY_UNSPECIFIED',
	'MEME_RARITY_COMMON',
	'MEME_RARITY_UNCOMMON',
	'MEME_RARITY_RARE',
	'MEME_RARITY_EPIC',
	'MEME_RARITY_LEGENDARY',
	'MEME_RARITY_MYTHIC',
] as const;
export const MemeRaritySchema = z.enum(MemeRarityValues);
export type MemeRarity = z.infer<typeof MemeRaritySchema>;

export const MemeElementValues = [
	'MEME_ELEMENT_UNSPECIFIED',
	'MEME_ELEMENT_DANK',
	'MEME_ELEMENT_WHOLESOME',
	'MEME_ELEMENT_CURSED',
	'MEME_ELEMENT_DEEP_FRIED',
	'MEME_ELEMENT_SURREAL',
	'MEME_ELEMENT_META',
	'MEME_ELEMENT_EDGY',
	'MEME_ELEMENT_NOSTALGIC',
] as const;
export const MemeElementSchema = z.enum(MemeElementValues);
export type MemeElement = z.infer<typeof MemeElementSchema>;

export const AbilityTriggerValues = [
	'ABILITY_TRIGGER_UNSPECIFIED',
	'ABILITY_TRIGGER_ON_PLAY',
	'ABILITY_TRIGGER_ON_ATTACK',
	'ABILITY_TRIGGER_ON_DEFEND',
	'ABILITY_TRIGGER_ON_DEATH',
	'ABILITY_TRIGGER_PASSIVE',
	'ABILITY_TRIGGER_ON_TURN_START',
	'ABILITY_TRIGGER_ON_TURN_END',
] as const;
export const AbilityTriggerSchema = z.enum(AbilityTriggerValues);
export type AbilityTrigger = z.infer<typeof AbilityTriggerSchema>;

export const AbilityEffectValues = [
	'ABILITY_EFFECT_UNSPECIFIED',
	'ABILITY_EFFECT_DAMAGE',
	'ABILITY_EFFECT_HEAL',
	'ABILITY_EFFECT_BUFF_ATK',
	'ABILITY_EFFECT_BUFF_DEF',
	'ABILITY_EFFECT_DEBUFF_ATK',
	'ABILITY_EFFECT_DEBUFF_DEF',
	'ABILITY_EFFECT_DRAW',
	'ABILITY_EFFECT_STUN',
	'ABILITY_EFFECT_SHIELD',
	'ABILITY_EFFECT_ELEMENT_SHIFT',
] as const;
export const AbilityEffectSchema = z.enum(AbilityEffectValues);
export type AbilityEffect = z.infer<typeof AbilityEffectSchema>;

export const FeedSortValues = [
	'FEED_SORT_UNSPECIFIED',
	'FEED_SORT_HOT',
	'FEED_SORT_NEW',
	'FEED_SORT_TOP',
	'FEED_SORT_RANDOM',
	'FEED_SORT_RISING',
] as const;
export const FeedSortSchema = z.enum(FeedSortValues);
export type FeedSort = z.infer<typeof FeedSortSchema>;

export const FeedTimeWindowValues = [
	'FEED_TIME_UNSPECIFIED',
	'FEED_TIME_HOUR',
	'FEED_TIME_DAY',
	'FEED_TIME_WEEK',
	'FEED_TIME_MONTH',
	'FEED_TIME_ALL',
] as const;
export const FeedTimeWindowSchema = z.enum(FeedTimeWindowValues);
export type FeedTimeWindow = z.infer<typeof FeedTimeWindowSchema>;

export const ReportReasonValues = [
	'REPORT_REASON_UNSPECIFIED',
	'REPORT_REASON_SPAM',
	'REPORT_REASON_NSFW',
	'REPORT_REASON_HATE_SPEECH',
	'REPORT_REASON_HARASSMENT',
	'REPORT_REASON_COPYRIGHT',
	'REPORT_REASON_MISINFORMATION',
	'REPORT_REASON_OTHER',
] as const;
export const ReportReasonSchema = z.enum(ReportReasonValues);
export type ReportReason = z.infer<typeof ReportReasonSchema>;

export const BattleStatusValues = [
	'BATTLE_STATUS_UNSPECIFIED',
	'BATTLE_STATUS_WAITING',
	'BATTLE_STATUS_IN_PROGRESS',
	'BATTLE_STATUS_COMPLETED',
	'BATTLE_STATUS_ABANDONED',
	'BATTLE_STATUS_DRAW',
] as const;
export const BattleStatusSchema = z.enum(BattleStatusValues);
export type BattleStatus = z.infer<typeof BattleStatusSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────

export const MemeCaptionSchema = z.object({
	text: z.string(),
	position_x: z.number(),
	position_y: z.number(),
	font_size: z.number().optional(),
	font_family: z.string().optional(),
	color: z.string().optional(),
	stroke_color: z.string().optional(),
	stroke_width: z.number().optional(),
	rotation: z.number().optional(),
	text_align: z.string().optional(),
	max_width: z.number().optional(),
});
export type MemeCaption = z.infer<typeof MemeCaptionSchema>;

export const TemplateCaptionSlotSchema = z.object({
	label: z.string(),
	default_x: z.number(),
	default_y: z.number(),
	default_font_size: z.number().optional(),
	placeholder: z.string().optional(),
	max_width: z.number().optional(),
	max_chars: z.number().int().optional(),
});
export type TemplateCaptionSlot = z.infer<typeof TemplateCaptionSlotSchema>;

export const CardAbilitySchema = z.object({
	name: z.string(),
	description: z.string(),
	trigger: AbilityTriggerSchema,
	effect: AbilityEffectSchema,
	value: z.number().int(),
	cooldown: z.number().int().optional(),
	duration: z.number().int().optional(),
});
export type CardAbility = z.infer<typeof CardAbilitySchema>;

export const ElementMatchupSchema = z.object({
	attacker: MemeElementSchema,
	defender: MemeElementSchema,
	damage_multiplier: z.number(),
});
export type ElementMatchup = z.infer<typeof ElementMatchupSchema>;

export const MemeReactionSchema = z.object({
	meme_id: z.string(),
	user_id: z.string(),
	reaction: ReactionTypeSchema,
	created_at: z.string(),
});
export type MemeReaction = z.infer<typeof MemeReactionSchema>;

export const MemeCommentSchema = z.object({
	id: z.string(),
	meme_id: z.string(),
	author_id: z.string(),
	body: z.string(),
	parent_id: z.string().optional(),
	reaction_count: z.number(),
	reply_count: z.number().int(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});
export type MemeComment = z.infer<typeof MemeCommentSchema>;

export const MemeSaveSchema = z.object({
	meme_id: z.string(),
	user_id: z.string(),
	collection_id: z.string().optional(),
	created_at: z.string(),
});
export type MemeSave = z.infer<typeof MemeSaveSchema>;

export const MemeCollectionSchema = z.object({
	id: z.string(),
	owner_id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	cover_meme_id: z.string().optional(),
	is_public: z.boolean(),
	meme_count: z.number().int(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});
export type MemeCollection = z.infer<typeof MemeCollectionSchema>;

export const MemePlayerStatsSchema = z.object({
	user_id: z.string(),
	total_battles: z.number().int(),
	wins: z.number().int(),
	losses: z.number().int(),
	draws: z.number().int(),
	elo_rating: z.number().int(),
	cards_owned: z.number().int(),
	highest_streak: z.number().int(),
	rank_title: z.string().optional(),
});
export type MemePlayerStats = z.infer<typeof MemePlayerStatsSchema>;

export const MemeFollowSchema = z.object({
	follower_id: z.string(),
	following_id: z.string(),
	created_at: z.string(),
});
export type MemeFollow = z.infer<typeof MemeFollowSchema>;

export const DeckCardSchema = z.object({
	card_id: z.string(),
	position: z.number().int().optional(),
});
export type DeckCard = z.infer<typeof DeckCardSchema>;

export const BattleActionSchema = z.object({
	turn: z.number().int(),
	player_id: z.string(),
	card_id: z.string(),
	target_card_id: z.string().optional(),
	ability_name: z.string().optional(),
	damage_dealt: z.number().int(),
	healing_done: z.number().int(),
	effect_applied: z.string().optional(),
});
export type BattleAction = z.infer<typeof BattleActionSchema>;

export const MemeReportSchema = z.object({
	id: z.string(),
	meme_id: z.string(),
	reporter_id: z.string(),
	reason: ReportReasonSchema,
	detail: z.string().optional(),
	resolved: z.boolean(),
	resolved_by: z.string().optional(),
	resolution_note: z.string().optional(),
	created_at: z.string(),
	resolved_at: z.string().optional(),
});
export type MemeReport = z.infer<typeof MemeReportSchema>;

export const FeedRequestSchema = z.object({
	limit: z.number().int(),
	cursor: z.string().optional(),
	sort: FeedSortSchema,
	time_window: FeedTimeWindowSchema.optional(),
	tag: z.string().optional(),
	author_id: z.string().optional(),
	element: MemeElementSchema.optional(),
	cards_only: z.boolean().optional(),
});
export type FeedRequest = z.infer<typeof FeedRequestSchema>;

export const GetMemeRequestSchema = z.object({
	id: z.string(),
});
export type GetMemeRequest = z.infer<typeof GetMemeRequestSchema>;

export const UpdateMemeRequestSchema = z.object({
	id: z.string(),
	title: z.string().optional(),
	tags: z.array(z.string()),
	alt_text: z.string().optional(),
	status: MemeStatusSchema.optional(),
});
export type UpdateMemeRequest = z.infer<typeof UpdateMemeRequestSchema>;

export const DeleteMemeRequestSchema = z.object({
	id: z.string(),
});
export type DeleteMemeRequest = z.infer<typeof DeleteMemeRequestSchema>;

export const DeleteMemeResponseSchema = z.object({
	result: ResultSchema,
});
export type DeleteMemeResponse = z.infer<typeof DeleteMemeResponseSchema>;

export const ReactRequestSchema = z.object({
	meme_id: z.string(),
	reaction: ReactionTypeSchema,
});
export type ReactRequest = z.infer<typeof ReactRequestSchema>;

export const ReactResponseSchema = z.object({
	result: ResultSchema,
});
export type ReactResponse = z.infer<typeof ReactResponseSchema>;

export const AddCommentRequestSchema = z.object({
	meme_id: z.string(),
	body: z.string(),
	parent_id: z.string().optional(),
});
export type AddCommentRequest = z.infer<typeof AddCommentRequestSchema>;

export const ListCommentsRequestSchema = z.object({
	meme_id: z.string(),
	limit: z.number().int(),
	cursor: z.string().optional(),
	parent_id: z.string().optional(),
});
export type ListCommentsRequest = z.infer<typeof ListCommentsRequestSchema>;

export const SaveMemeRequestSchema = z.object({
	meme_id: z.string(),
	collection_id: z.string().optional(),
});
export type SaveMemeRequest = z.infer<typeof SaveMemeRequestSchema>;

export const SaveMemeResponseSchema = z.object({
	result: ResultSchema,
});
export type SaveMemeResponse = z.infer<typeof SaveMemeResponseSchema>;

export const UnsaveMemeRequestSchema = z.object({
	meme_id: z.string(),
	collection_id: z.string().optional(),
});
export type UnsaveMemeRequest = z.infer<typeof UnsaveMemeRequestSchema>;

export const UnsaveMemeResponseSchema = z.object({
	result: ResultSchema,
});
export type UnsaveMemeResponse = z.infer<typeof UnsaveMemeResponseSchema>;

export const CreateCollectionRequestSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	is_public: z.boolean(),
});
export type CreateCollectionRequest = z.infer<
	typeof CreateCollectionRequestSchema
>;

export const ListCollectionsRequestSchema = z.object({
	owner_id: z.string(),
	limit: z.number().int(),
	cursor: z.string().optional(),
});
export type ListCollectionsRequest = z.infer<
	typeof ListCollectionsRequestSchema
>;

export const GetCollectionMemesRequestSchema = z.object({
	collection_id: z.string(),
	limit: z.number().int(),
	cursor: z.string().optional(),
});
export type GetCollectionMemesRequest = z.infer<
	typeof GetCollectionMemesRequestSchema
>;

export const GetTemplateRequestSchema = z.object({
	id: z.string(),
});
export type GetTemplateRequest = z.infer<typeof GetTemplateRequestSchema>;

export const ListTemplatesRequestSchema = z.object({
	limit: z.number().int(),
	cursor: z.string().optional(),
	search: z.string().optional(),
});
export type ListTemplatesRequest = z.infer<typeof ListTemplatesRequestSchema>;

export const GetMemeProfileRequestSchema = z.object({
	user_id: z.string(),
});
export type GetMemeProfileRequest = z.infer<typeof GetMemeProfileRequestSchema>;

export const FollowRequestSchema = z.object({
	target_user_id: z.string(),
});
export type FollowRequest = z.infer<typeof FollowRequestSchema>;

export const FollowResponseSchema = z.object({
	result: ResultSchema,
});
export type FollowResponse = z.infer<typeof FollowResponseSchema>;

export const UnfollowRequestSchema = z.object({
	target_user_id: z.string(),
});
export type UnfollowRequest = z.infer<typeof UnfollowRequestSchema>;

export const UnfollowResponseSchema = z.object({
	result: ResultSchema,
});
export type UnfollowResponse = z.infer<typeof UnfollowResponseSchema>;

export const ListFollowersRequestSchema = z.object({
	user_id: z.string(),
	limit: z.number().int(),
	cursor: z.string().optional(),
});
export type ListFollowersRequest = z.infer<typeof ListFollowersRequestSchema>;

export const ListFollowingRequestSchema = z.object({
	user_id: z.string(),
	limit: z.number().int(),
	cursor: z.string().optional(),
});
export type ListFollowingRequest = z.infer<typeof ListFollowingRequestSchema>;

export const ReportMemeRequestSchema = z.object({
	meme_id: z.string(),
	reason: ReportReasonSchema,
	detail: z.string().optional(),
});
export type ReportMemeRequest = z.infer<typeof ReportMemeRequestSchema>;

export const ReportMemeResponseSchema = z.object({
	result: ResultSchema,
});
export type ReportMemeResponse = z.infer<typeof ReportMemeResponseSchema>;

export const MintCardRequestSchema = z.object({
	meme_id: z.string(),
});
export type MintCardRequest = z.infer<typeof MintCardRequestSchema>;

export const CreateDeckRequestSchema = z.object({
	name: z.string(),
	card_ids: z.array(z.string()),
});
export type CreateDeckRequest = z.infer<typeof CreateDeckRequestSchema>;

export const UpdateDeckRequestSchema = z.object({
	deck_id: z.string(),
	name: z.string().optional(),
	card_ids: z.array(z.string()),
	is_active: z.boolean().optional(),
});
export type UpdateDeckRequest = z.infer<typeof UpdateDeckRequestSchema>;

export const ListDecksRequestSchema = z.object({
	owner_id: z.string(),
});
export type ListDecksRequest = z.infer<typeof ListDecksRequestSchema>;

export const StartBattleRequestSchema = z.object({
	deck_id: z.string(),
});
export type StartBattleRequest = z.infer<typeof StartBattleRequestSchema>;

export const StartBattleResponseSchema = z.object({
	result: ResultSchema,
	battle_id: z.string().optional(),
	status: BattleStatusSchema.optional(),
});
export type StartBattleResponse = z.infer<typeof StartBattleResponseSchema>;

export const GetBattleRequestSchema = z.object({
	battle_id: z.string(),
});
export type GetBattleRequest = z.infer<typeof GetBattleRequestSchema>;

export const ListBattleHistoryRequestSchema = z.object({
	user_id: z.string(),
	limit: z.number().int(),
	cursor: z.string().optional(),
});
export type ListBattleHistoryRequest = z.infer<
	typeof ListBattleHistoryRequestSchema
>;

export const SubmitMemeRequestSchema = z.object({
	title: z.string().optional(),
	template_id: z.string().optional(),
	format: MemeFormatSchema,
	asset_url: z.string(),
	captions: z.array(MemeCaptionSchema),
	tags: z.array(z.string()),
	source_url: z.string().optional(),
	alt_text: z.string().optional(),
});
export type SubmitMemeRequest = z.infer<typeof SubmitMemeRequestSchema>;

export const MemeTemplateSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	image_url: z.string(),
	thumbnail_url: z.string().optional(),
	width: z.number().int(),
	height: z.number().int(),
	slots: z.array(TemplateCaptionSlotSchema),
	usage_count: z.number(),
	tags: z.array(z.string()),
	created_at: z.string(),
	updated_at: z.string().optional(),
});
export type MemeTemplate = z.infer<typeof MemeTemplateSchema>;

export const MemeCardStatsSchema = z.object({
	meme_id: z.string(),
	rarity: MemeRaritySchema,
	element: MemeElementSchema,
	attack: z.number().int(),
	defense: z.number().int(),
	hp: z.number().int(),
	energy_cost: z.number().int(),
	abilities: z.array(CardAbilitySchema),
	flavor_text: z.string().optional(),
	level: z.number().int(),
	xp: z.number(),
	evolves_from: z.string().optional(),
	evolves_into: z.string().optional(),
});
export type MemeCardStats = z.infer<typeof MemeCardStatsSchema>;

export const AddCommentResponseSchema = z.object({
	result: ResultSchema,
	comment: MemeCommentSchema.optional(),
});
export type AddCommentResponse = z.infer<typeof AddCommentResponseSchema>;

export const ListCommentsResponseSchema = z.object({
	comments: z.array(MemeCommentSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type ListCommentsResponse = z.infer<typeof ListCommentsResponseSchema>;

export const CreateCollectionResponseSchema = z.object({
	result: ResultSchema,
	collection: MemeCollectionSchema.optional(),
});
export type CreateCollectionResponse = z.infer<
	typeof CreateCollectionResponseSchema
>;

export const ListCollectionsResponseSchema = z.object({
	collections: z.array(MemeCollectionSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type ListCollectionsResponse = z.infer<
	typeof ListCollectionsResponseSchema
>;

export const MemeUserProfileSchema = z.object({
	user_id: z.string(),
	display_name: z.string().optional(),
	avatar_url: z.string().optional(),
	bio: z.string().optional(),
	total_memes: z.number(),
	total_reactions_received: z.number(),
	total_views_received: z.number(),
	follower_count: z.number().int(),
	following_count: z.number().int(),
	card_stats: MemePlayerStatsSchema.optional(),
	joined_at: z.string(),
	updated_at: z.string().optional(),
});
export type MemeUserProfile = z.infer<typeof MemeUserProfileSchema>;

export const MemeDeckSchema = z.object({
	id: z.string(),
	owner_id: z.string(),
	name: z.string(),
	cards: z.array(DeckCardSchema),
	is_active: z.boolean(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});
export type MemeDeck = z.infer<typeof MemeDeckSchema>;

export const BattleResultSchema = z.object({
	battle_id: z.string(),
	player_a_id: z.string(),
	player_b_id: z.string(),
	status: BattleStatusSchema,
	winner_id: z.string().optional(),
	total_turns: z.number().int(),
	actions: z.array(BattleActionSchema),
	elo_delta_a: z.number().int(),
	elo_delta_b: z.number().int(),
	created_at: z.string(),
	completed_at: z.string().optional(),
});
export type BattleResult = z.infer<typeof BattleResultSchema>;

export const GetTemplateResponseSchema = z.object({
	found: z.boolean(),
	template: MemeTemplateSchema.optional(),
});
export type GetTemplateResponse = z.infer<typeof GetTemplateResponseSchema>;

export const ListTemplatesResponseSchema = z.object({
	templates: z.array(MemeTemplateSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type ListTemplatesResponse = z.infer<typeof ListTemplatesResponseSchema>;

export const MemeSchema = z.object({
	id: z.string(),
	author_id: z.string(),
	title: z.string().optional(),
	template_id: z.string().optional(),
	format: MemeFormatSchema,
	status: MemeStatusSchema,
	asset_url: z.string(),
	thumbnail_url: z.string().optional(),
	width: z.number().int().optional(),
	height: z.number().int().optional(),
	file_size: z.number().optional(),
	captions: z.array(MemeCaptionSchema),
	tags: z.array(z.string()),
	source_url: z.string().optional(),
	alt_text: z.string().optional(),
	view_count: z.number(),
	reaction_count: z.number(),
	share_count: z.number(),
	comment_count: z.number(),
	save_count: z.number(),
	created_at: z.string(),
	updated_at: z.string().optional(),
	published_at: z.string().optional(),
	card: MemeCardStatsSchema.optional(),
	content_hash: z.string().optional(),
});
export type Meme = z.infer<typeof MemeSchema>;

export const MintCardResponseSchema = z.object({
	result: ResultSchema,
	card: MemeCardStatsSchema.optional(),
});
export type MintCardResponse = z.infer<typeof MintCardResponseSchema>;

export const GetMemeProfileResponseSchema = z.object({
	found: z.boolean(),
	profile: MemeUserProfileSchema.optional(),
});
export type GetMemeProfileResponse = z.infer<
	typeof GetMemeProfileResponseSchema
>;

export const ListFollowersResponseSchema = z.object({
	followers: z.array(MemeUserProfileSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type ListFollowersResponse = z.infer<typeof ListFollowersResponseSchema>;

export const ListFollowingResponseSchema = z.object({
	following: z.array(MemeUserProfileSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type ListFollowingResponse = z.infer<typeof ListFollowingResponseSchema>;

export const CreateDeckResponseSchema = z.object({
	result: ResultSchema,
	deck: MemeDeckSchema.optional(),
});
export type CreateDeckResponse = z.infer<typeof CreateDeckResponseSchema>;

export const UpdateDeckResponseSchema = z.object({
	result: ResultSchema,
	deck: MemeDeckSchema.optional(),
});
export type UpdateDeckResponse = z.infer<typeof UpdateDeckResponseSchema>;

export const ListDecksResponseSchema = z.object({
	decks: z.array(MemeDeckSchema),
});
export type ListDecksResponse = z.infer<typeof ListDecksResponseSchema>;

export const GetBattleResponseSchema = z.object({
	found: z.boolean(),
	battle: BattleResultSchema.optional(),
});
export type GetBattleResponse = z.infer<typeof GetBattleResponseSchema>;

export const ListBattleHistoryResponseSchema = z.object({
	battles: z.array(BattleResultSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type ListBattleHistoryResponse = z.infer<
	typeof ListBattleHistoryResponseSchema
>;

export const FeedResponseSchema = z.object({
	memes: z.array(MemeSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type FeedResponse = z.infer<typeof FeedResponseSchema>;

export const SubmitMemeResponseSchema = z.object({
	result: ResultSchema,
	meme: MemeSchema.optional(),
});
export type SubmitMemeResponse = z.infer<typeof SubmitMemeResponseSchema>;

export const GetMemeResponseSchema = z.object({
	found: z.boolean(),
	meme: MemeSchema.optional(),
});
export type GetMemeResponse = z.infer<typeof GetMemeResponseSchema>;

export const UpdateMemeResponseSchema = z.object({
	result: ResultSchema,
	meme: MemeSchema.optional(),
});
export type UpdateMemeResponse = z.infer<typeof UpdateMemeResponseSchema>;

export const GetCollectionMemesResponseSchema = z.object({
	memes: z.array(MemeSchema),
	next_cursor: z.string().optional(),
	has_more: z.boolean(),
});
export type GetCollectionMemesResponse = z.infer<
	typeof GetCollectionMemesResponseSchema
>;
