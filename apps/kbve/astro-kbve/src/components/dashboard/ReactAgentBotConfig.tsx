import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { Loader2, RefreshCw, Save, Settings2 } from 'lucide-react';
import { agentsService, type DiscordshConfig } from './agentsService';
import { styles } from './dashboard-ui';

const SNOWFLAKE_RE = /^[0-9]{17,20}$/;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

interface FormState {
	default_repo: string;
	claim_channel_id: string;
	forum_channel_id: string;
	noticeboard_channel_id: string;
	taskboard_channel_id: string;
	max_assignees: string;
	mirror_pr_events: boolean;
	active: boolean;
}

function emptyForm(): FormState {
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

function configToForm(c: DiscordshConfig): FormState {
	const base = emptyForm();
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

function formToConfig(f: FormState): DiscordshConfig {
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

function fieldError(
	value: string,
	kind: 'snowflake' | 'repo' | 'int',
	required = false,
): string | null {
	const trimmed = value.trim();
	if (!trimmed) return required ? 'Required' : null;
	if (kind === 'snowflake' && !SNOWFLAKE_RE.test(trimmed)) {
		return 'Must be a Discord snowflake (17–20 digits)';
	}
	if (kind === 'repo' && !REPO_RE.test(trimmed)) {
		return 'Must be owner/repo';
	}
	if (kind === 'int') {
		const n = parseInt(trimmed, 10);
		if (Number.isNaN(n) || n < 1 || n > 10) return 'Must be 1–10';
	}
	return null;
}

export default function ReactAgentBotConfig() {
	const guildId = useStore(agentsService.$selectedGuildId);
	const guilds = useStore(agentsService.$guilds);

	const [form, setForm] = useState<FormState>(emptyForm);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const load = useCallback(async () => {
		if (!guildId) return;
		setLoading(true);
		setError(null);
		setSuccess(null);
		const r = await agentsService.getBotConfig();
		setLoading(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		setForm(configToForm(r.config));
	}, [guildId]);

	useEffect(() => {
		void load();
	}, [load]);

	if (!guildId) {
		return (
			<section style={styles.sectionBorder}>
				<div style={{ padding: '0.85rem 1rem' }}>
					<p
						style={{
							margin: 0,
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontSize: '0.9rem',
						}}>
						Pick a guild above to manage its DiscordSH config.
					</p>
				</div>
			</section>
		);
	}

	const guild = guilds.find((g) => g.id === guildId);

	const errors = {
		default_repo: fieldError(form.default_repo, 'repo'),
		claim_channel_id: fieldError(form.claim_channel_id, 'snowflake'),
		forum_channel_id: fieldError(form.forum_channel_id, 'snowflake'),
		noticeboard_channel_id: fieldError(
			form.noticeboard_channel_id,
			'snowflake',
		),
		taskboard_channel_id: fieldError(
			form.taskboard_channel_id,
			'snowflake',
		),
		max_assignees: fieldError(form.max_assignees, 'int', true),
	};
	const anyError = Object.values(errors).some((e) => e !== null);

	async function save() {
		if (anyError || saving) return;
		setSaving(true);
		setError(null);
		setSuccess(null);
		const cfg = formToConfig(form);
		const r = await agentsService.setBotConfig(cfg);
		setSaving(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		setSuccess('Saved.');
		setTimeout(() => setSuccess(null), 2500);
	}

	function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
		setForm((prev) => ({ ...prev, [k]: v }));
	}

	return (
		<section style={styles.sectionBorder}>
			<header
				style={{
					padding: '0.85rem 1rem',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
				}}>
				<Settings2 size={18} color="#58a6ff" />
				<strong>Bot config</strong>
				{guild && (
					<span
						style={{
							marginLeft: '0.4rem',
							fontSize: '0.75rem',
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontFamily:
								'var(--sl-font-mono, ui-monospace, monospace)',
						}}>
						{guild.id}
					</span>
				)}
				<button
					type="button"
					onClick={() => void load()}
					disabled={loading || saving}
					style={refreshBtn(loading || saving)}
					aria-label="Refresh">
					<RefreshCw
						size={14}
						style={loading ? spinIcon : undefined}
					/>
					Refresh
				</button>
			</header>

			<div
				style={{
					padding: '0.85rem 1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.85rem',
				}}>
				<p style={muted}>
					Per-guild knobs the bot reads at startup. Stored as
					<code> discordsh_config:&lt;guild&gt;</code> in Vault.
					Channels are raw Discord snowflakes — pick them via
					right-click → Copy ID in your Discord client (Developer Mode
					required).
				</p>

				<Field
					label="Default repository"
					hint="Used by /gh shortcuts when no repo argument is supplied. Format: owner/repo."
					error={errors.default_repo}>
					<input
						type="text"
						value={form.default_repo}
						placeholder="KBVE/kbve"
						onChange={(e) => patch('default_repo', e.target.value)}
						style={mono}
						spellCheck={false}
					/>
				</Field>

				<ChannelField
					label="Claim channel"
					hint="Channel that /gh claim posts confirmations to."
					value={form.claim_channel_id}
					error={errors.claim_channel_id}
					onChange={(v) => patch('claim_channel_id', v)}
				/>

				<ChannelField
					label="Forum channel"
					hint="Forum channel where issue threads are created (P2 of #11262)."
					value={form.forum_channel_id}
					error={errors.forum_channel_id}
					onChange={(v) => patch('forum_channel_id', v)}
				/>

				<ChannelField
					label="Notice board channel"
					hint="Channel for /github noticeboard embeds."
					value={form.noticeboard_channel_id}
					error={errors.noticeboard_channel_id}
					onChange={(v) => patch('noticeboard_channel_id', v)}
				/>

				<ChannelField
					label="Task board channel"
					hint="Channel for /github taskboard embeds."
					value={form.taskboard_channel_id}
					error={errors.taskboard_channel_id}
					onChange={(v) => patch('taskboard_channel_id', v)}
				/>

				<Field
					label="Max assignees per claim"
					hint="Refuse /gh claim once an issue already has this many GitHub assignees."
					error={errors.max_assignees}>
					<input
						type="number"
						value={form.max_assignees}
						min={1}
						max={10}
						onChange={(e) => patch('max_assignees', e.target.value)}
						style={{ ...input, width: 100 }}
					/>
				</Field>

				<label style={toggleRow}>
					<input
						type="checkbox"
						checked={form.mirror_pr_events}
						onChange={(e) =>
							patch('mirror_pr_events', e.target.checked)
						}
					/>
					<span>
						<strong>Mirror PR events</strong>
						<span style={subtle}>
							Include pull_request + PR review events when the bot
							syncs GitHub activity to Discord.
						</span>
					</span>
				</label>

				<label style={toggleRow}>
					<input
						type="checkbox"
						checked={form.active}
						onChange={(e) => patch('active', e.target.checked)}
					/>
					<span>
						<strong>Active</strong>
						<span style={subtle}>
							Mute the bot for this guild without removing it.
							When false, slash commands no-op and webhook events
							are dropped.
						</span>
					</span>
				</label>

				{error && <p style={errText}>{error}</p>}
				{success && (
					<p style={{ ...muted, color: '#4ade80' }}>{success}</p>
				)}

				<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
					<button
						type="button"
						onClick={() => void save()}
						disabled={anyError || saving}
						style={primaryBtn(!anyError && !saving)}>
						{saving ? (
							<Loader2 size={14} style={spinIcon} />
						) : (
							<Save size={14} />
						)}
						{saving ? 'Saving…' : 'Save config'}
					</button>
				</div>
			</div>
		</section>
	);
}

function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string | null;
	children: React.ReactNode;
}) {
	return (
		<label
			style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
			<span style={fieldLabel}>{label}</span>
			{children}
			{hint && !error && <span style={subtle}>{hint}</span>}
			{error && <span style={errText}>{error}</span>}
		</label>
	);
}

function ChannelField({
	label,
	hint,
	value,
	error,
	onChange,
}: {
	label: string;
	hint?: string;
	value: string;
	error: string | null;
	onChange: (v: string) => void;
}) {
	return (
		<Field label={label} hint={hint} error={error}>
			<input
				type="text"
				value={value}
				placeholder="Discord snowflake"
				onChange={(e) => onChange(e.target.value)}
				style={mono}
				spellCheck={false}
			/>
		</Field>
	);
}

const muted: React.CSSProperties = {
	margin: 0,
	fontSize: '0.85rem',
	color: 'var(--sl-color-gray-2, #c2c5cc)',
	lineHeight: 1.5,
};

const subtle: React.CSSProperties = {
	display: 'block',
	fontSize: '0.75rem',
	color: 'var(--sl-color-gray-3, #9ca0aa)',
	marginTop: '0.15rem',
};

const fieldLabel: React.CSSProperties = {
	fontSize: '0.8rem',
	fontWeight: 600,
	color: 'var(--sl-color-white, #fff)',
};

const errText: React.CSSProperties = {
	margin: 0,
	color: '#f87171',
	fontSize: '0.78rem',
};

const input: React.CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 6,
	color: 'var(--sl-color-white, #fff)',
	padding: '0.5rem 0.65rem',
	fontSize: '0.9rem',
	boxSizing: 'border-box',
};

const mono: React.CSSProperties = {
	...input,
	fontFamily: 'var(--sl-font-mono, ui-monospace, monospace)',
	width: '100%',
};

function primaryBtn(enabled: boolean): React.CSSProperties {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
		padding: '0.5rem 1rem',
		borderRadius: 8,
		border: 'none',
		background: enabled ? '#58a6ff' : 'rgba(88,166,255,0.4)',
		color: '#0d1117',
		fontWeight: 600,
		cursor: enabled ? 'pointer' : 'not-allowed',
		fontSize: '0.9rem',
	};
}

function refreshBtn(busy: boolean): React.CSSProperties {
	return {
		marginLeft: 'auto',
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.35rem',
		padding: '0.3rem 0.6rem',
		borderRadius: 6,
		border: '1px solid var(--sl-color-gray-5, #2d2f36)',
		background: 'transparent',
		color: 'var(--sl-color-white, #fff)',
		cursor: busy ? 'wait' : 'pointer',
		fontSize: '0.8rem',
	};
}

const toggleRow: React.CSSProperties = {
	display: 'flex',
	alignItems: 'flex-start',
	gap: '0.55rem',
	padding: '0.5rem 0.7rem',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 8,
	background: 'rgba(255,255,255,0.02)',
};

const spinIcon: React.CSSProperties = {
	animation: 'spin 1s linear infinite',
};
