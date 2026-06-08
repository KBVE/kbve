import type { BotConfigFormDraft, DiscordshConfig } from './types';

export function emptyBotConfigFormDraft(): BotConfigFormDraft {
	return {
		default_repo: '',
		claim_channel_id: '',
		forum_channel_id: '',
		noticeboard_channel_id: '',
		taskboard_channel_id: '',
		max_assignees: '2',
		mirror_pr_events: true,
		active: true,
	};
}

export function botConfigToFormDraft(c: DiscordshConfig): BotConfigFormDraft {
	const base = emptyBotConfigFormDraft();
	return {
		default_repo: c.default_repo ?? base.default_repo,
		claim_channel_id: c.claim_channel_id ?? base.claim_channel_id,
		forum_channel_id: c.forum_channel_id ?? base.forum_channel_id,
		noticeboard_channel_id:
			c.noticeboard_channel_id ?? base.noticeboard_channel_id,
		taskboard_channel_id:
			c.taskboard_channel_id ?? base.taskboard_channel_id,
		max_assignees:
			typeof c.max_assignees === 'number'
				? String(c.max_assignees)
				: base.max_assignees,
		mirror_pr_events:
			typeof c.mirror_pr_events === 'boolean'
				? c.mirror_pr_events
				: base.mirror_pr_events,
		active: typeof c.active === 'boolean' ? c.active : base.active,
	};
}

export function botConfigFromFormDraft(f: BotConfigFormDraft): DiscordshConfig {
	const cfg: DiscordshConfig = {
		mirror_pr_events: f.mirror_pr_events,
		active: f.active,
	};
	if (f.default_repo.trim()) cfg.default_repo = f.default_repo.trim();
	if (f.claim_channel_id.trim())
		cfg.claim_channel_id = f.claim_channel_id.trim();
	if (f.forum_channel_id.trim())
		cfg.forum_channel_id = f.forum_channel_id.trim();
	if (f.noticeboard_channel_id.trim())
		cfg.noticeboard_channel_id = f.noticeboard_channel_id.trim();
	if (f.taskboard_channel_id.trim())
		cfg.taskboard_channel_id = f.taskboard_channel_id.trim();
	const max = parseInt(f.max_assignees, 10);
	if (!Number.isNaN(max) && max > 0) cfg.max_assignees = max;
	return cfg;
}
