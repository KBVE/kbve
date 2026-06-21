import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FocusEvent,
	type FormEvent,
} from 'react';
import { useStore } from '@nanostores/react';
import { Hash, Loader2, RefreshCw, Save, Settings2 } from 'lucide-react';
import { useAgents } from './context';
import { emptyBotConfigFormDraft } from '@kbve/droid';
import type { BotConfigFormDraft, DiscordChannel } from '@kbve/droid';
import { styles } from '../dashboard/dashboard-ui';

const SNOWFLAKE_RE = /^[0-9]{17,20}$/;
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

type TextFieldKey =
	| 'default_repo'
	| 'claim_channel_id'
	| 'forum_channel_id'
	| 'noticeboard_channel_id'
	| 'taskboard_channel_id'
	| 'max_assignees';

type BoolFieldKey = 'mirror_pr_events' | 'active';

type Errors = Partial<Record<TextFieldKey, string>>;

function validateField(k: TextFieldKey, raw: string): string | null {
	const v = raw.trim();
	if (k === 'max_assignees') {
		if (!v) return 'Required';
		const n = parseInt(v, 10);
		if (Number.isNaN(n) || n < 1 || n > 10) return 'Must be 1–10';
		return null;
	}
	if (!v) return null;
	if (k === 'default_repo') {
		return REPO_RE.test(v) ? null : 'Must be owner/repo';
	}
	return SNOWFLAKE_RE.test(v)
		? null
		: 'Must be a Discord snowflake (17–20 digits)';
}

function readForm(
	refs: Record<TextFieldKey, HTMLInputElement | null>,
	mirror: boolean,
	active: boolean,
): BotConfigFormDraft {
	const get = (k: TextFieldKey) => refs[k]?.value ?? '';
	return {
		default_repo: get('default_repo'),
		claim_channel_id: get('claim_channel_id'),
		forum_channel_id: get('forum_channel_id'),
		noticeboard_channel_id: get('noticeboard_channel_id'),
		taskboard_channel_id: get('taskboard_channel_id'),
		max_assignees: get('max_assignees'),
		mirror_pr_events: mirror,
		active,
	};
}

function validateAll(draft: BotConfigFormDraft): Errors {
	const errs: Errors = {};
	const keys: TextFieldKey[] = [
		'default_repo',
		'claim_channel_id',
		'forum_channel_id',
		'noticeboard_channel_id',
		'taskboard_channel_id',
		'max_assignees',
	];
	for (const k of keys) {
		const e = validateField(k, draft[k] as string);
		if (e) errs[k] = e;
	}
	return errs;
}

export default function ReactAgentBotConfig() {
	const agents = useAgents();
	const guildId = useStore(agents.$selectedGuildId);
	const guilds = useStore(agents.$guilds);
	const savingMap = useStore(agents.$botConfigSavingFor);
	const errorsMap = useStore(agents.$botConfigErrors);
	const loadedMap = useStore(agents.$botConfigLoadedFor);
	const channelsMap = useStore(agents.$guildChannels);
	const channelsLoadingMap = useStore(agents.$guildChannelsLoading);
	const channelsErrorMap = useStore(agents.$guildChannelsError);

	const [loading, setLoading] = useState(false);
	const [success, setSuccess] = useState<string | null>(null);
	const [errors, setErrors] = useState<Errors>({});
	const [, setRev] = useState(0);

	const saving = guildId ? !!savingMap[guildId] : false;
	const serverError = guildId ? (errorsMap[guildId] ?? null) : null;
	const loaded = guildId ? !!loadedMap[guildId] : false;

	const refs = useRef<Record<TextFieldKey, HTMLInputElement | null>>({
		default_repo: null,
		claim_channel_id: null,
		forum_channel_id: null,
		noticeboard_channel_id: null,
		taskboard_channel_id: null,
		max_assignees: null,
	});
	const mirrorRef = useRef<boolean>(true);
	const activeRef = useRef<boolean>(true);
	const initialDraftRef = useRef<BotConfigFormDraft>(
		emptyBotConfigFormDraft(),
	);

	const hydrate = useCallback(
		(force: boolean) => {
			if (!guildId) return;
			const snapshot =
				agents.$botConfigDrafts.get()[guildId] ??
				emptyBotConfigFormDraft();
			initialDraftRef.current = snapshot;
			mirrorRef.current = snapshot.mirror_pr_events;
			activeRef.current = snapshot.active;
			(Object.keys(refs.current) as TextFieldKey[]).forEach((k) => {
				const el = refs.current[k];
				if (
					el &&
					(force || el.value === '' || el.value !== snapshot[k])
				) {
					el.value = snapshot[k] as string;
				}
			});
			setErrors(validateAll(snapshot));
			setRev((r) => r + 1);
		},
		[guildId],
	);

	const load = useCallback(
		async (force = false) => {
			if (!guildId) return;
			setLoading(true);
			setSuccess(null);
			await agents.ensureBotConfigLoaded(guildId, force);
			setLoading(false);
			hydrate(true);
		},
		[guildId, hydrate],
	);

	useEffect(() => {
		if (!guildId) return;
		if (loaded) {
			hydrate(false);
		} else {
			void load();
		}
	}, [guildId, loaded, load, hydrate]);

	useEffect(() => {
		if (!guildId) return;
		void agents.ensureGuildChannelsLoaded(guildId);
	}, [guildId]);

	const channels = guildId ? channelsMap[guildId] : undefined;
	const channelsLoading = guildId ? !!channelsLoadingMap[guildId] : false;
	const channelsError = guildId ? (channelsErrorMap[guildId] ?? null) : null;

	useEffect(() => {
		if (!success) return;
		const t = setTimeout(() => setSuccess(null), 2500);
		return () => clearTimeout(t);
	}, [success]);

	function commitToDraft() {
		if (!guildId) return;
		const cur = readForm(
			refs.current,
			mirrorRef.current,
			activeRef.current,
		);
		agents.patchBotConfigDraft(guildId, cur);
	}

	function onFieldBlur(k: TextFieldKey) {
		return (_: FocusEvent<HTMLInputElement>) => {
			const v = refs.current[k]?.value ?? '';
			const err = validateField(k, v);
			setErrors((prev) => {
				const next = { ...prev };
				if (err) next[k] = err;
				else delete next[k];
				return next;
			});
			commitToDraft();
		};
	}

	function onChannelCommit(k: TextFieldKey) {
		return (value: string) => {
			if (!guildId) return;
			if (refs.current[k]) refs.current[k]!.value = value;
			const err = validateField(k, value);
			setErrors((prev) => {
				const next = { ...prev };
				if (err) next[k] = err;
				else delete next[k];
				return next;
			});
			agents.patchBotConfigDraft(guildId, { [k]: value });
		};
	}

	function onBoolChange(k: BoolFieldKey, v: boolean) {
		if (k === 'mirror_pr_events') mirrorRef.current = v;
		else activeRef.current = v;
		commitToDraft();
		setRev((r) => r + 1);
	}

	async function onSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!guildId || saving) return;
		const draft = readForm(
			refs.current,
			mirrorRef.current,
			activeRef.current,
		);
		const allErrors = validateAll(draft);
		setErrors(allErrors);
		const errorKeys = Object.keys(allErrors) as TextFieldKey[];
		if (errorKeys.length > 0) {
			const first = errorKeys[0];
			const el = refs.current[first];
			if (el) {
				el.focus();
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
			return;
		}
		agents.patchBotConfigDraft(guildId, draft);
		setSuccess(null);
		const r = await agents.saveBotConfigDraft(guildId);
		if (r.ok) setSuccess('Saved.');
	}

	const anyError = useMemo(() => Object.keys(errors).length > 0, [errors]);
	const guild = useMemo(
		() => guilds.find((g) => g.id === guildId),
		[guilds, guildId],
	);

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

	const d = initialDraftRef.current;

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
					onClick={() =>
						void agents.ensureGuildChannelsLoaded(guildId, true)
					}
					disabled={channelsLoading}
					style={refreshBtn(channelsLoading)}
					title="Re-fetch the bot's visible channels. Cached for 7 days otherwise to avoid Discord rate limits."
					aria-label="Refresh channels">
					<RefreshCw
						size={14}
						style={channelsLoading ? spinIcon : undefined}
					/>
					Channels
				</button>
				<button
					type="button"
					onClick={() => void load(true)}
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

			<form
				onSubmit={onSubmit}
				autoComplete="off"
				style={{
					padding: '0.85rem 1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.85rem',
				}}>
				<p style={muted}>
					Per-guild knobs the bot reads at startup. Stored as
					<code> discordsh_config:&lt;guild&gt;</code> in Vault.
					Channel pickers list the bot's visible channels — if the bot
					isn't in the guild yet, install it via the bot-install
					section above first.
				</p>

				<TextField
					label="Default repository"
					hint="Used by /gh shortcuts when no repo argument is supplied. Format: owner/repo."
					name="default_repo"
					defaultValue={d.default_repo}
					placeholder="KBVE/kbve"
					inputRef={(el) => (refs.current.default_repo = el)}
					onBlur={onFieldBlur('default_repo')}
					error={errors.default_repo}
					fontMono
				/>
				<ChannelPicker
					label="Claim channel"
					hint="Channel that /gh claim posts confirmations to."
					name="claim_channel_id"
					channelType="text"
					defaultValue={d.claim_channel_id}
					channels={channels?.texts}
					loading={channelsLoading}
					error={errors.claim_channel_id}
					sourceError={channelsError}
					inputRef={(el) => (refs.current.claim_channel_id = el)}
					onCommit={onChannelCommit('claim_channel_id')}
				/>
				<ChannelPicker
					label="Forum channel"
					hint="Forum channel where issue threads are created (P2 of #11262)."
					name="forum_channel_id"
					channelType="forum"
					defaultValue={d.forum_channel_id}
					channels={channels?.forums}
					loading={channelsLoading}
					error={errors.forum_channel_id}
					sourceError={channelsError}
					inputRef={(el) => (refs.current.forum_channel_id = el)}
					onCommit={onChannelCommit('forum_channel_id')}
				/>
				<ChannelPicker
					label="Notice board channel"
					hint="Channel for /github noticeboard embeds."
					name="noticeboard_channel_id"
					channelType="text"
					defaultValue={d.noticeboard_channel_id}
					channels={channels?.texts}
					loading={channelsLoading}
					error={errors.noticeboard_channel_id}
					sourceError={channelsError}
					inputRef={(el) =>
						(refs.current.noticeboard_channel_id = el)
					}
					onCommit={onChannelCommit('noticeboard_channel_id')}
				/>
				<ChannelPicker
					label="Task board channel"
					hint="Channel for /github taskboard embeds."
					name="taskboard_channel_id"
					channelType="text"
					defaultValue={d.taskboard_channel_id}
					channels={channels?.texts}
					loading={channelsLoading}
					error={errors.taskboard_channel_id}
					sourceError={channelsError}
					inputRef={(el) => (refs.current.taskboard_channel_id = el)}
					onCommit={onChannelCommit('taskboard_channel_id')}
				/>
				<TextField
					label="Max assignees per claim"
					hint="Refuse /gh claim once an issue already has this many GitHub assignees."
					name="max_assignees"
					defaultValue={d.max_assignees}
					placeholder="2"
					inputRef={(el) => (refs.current.max_assignees = el)}
					onBlur={onFieldBlur('max_assignees')}
					error={errors.max_assignees}
					inputMode="numeric"
					pattern="[0-9]*"
					maxWidth={100}
				/>

				<label style={toggleRow}>
					<input
						type="checkbox"
						defaultChecked={d.mirror_pr_events}
						onChange={(e) =>
							onBoolChange('mirror_pr_events', e.target.checked)
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
						defaultChecked={d.active}
						onChange={(e) =>
							onBoolChange('active', e.target.checked)
						}
					/>
					<span>
						<strong>Active</strong>
						<span style={subtle}>
							Master switch. Disable to temporarily silence the
							bot for this guild without deleting the config row.
						</span>
					</span>
				</label>

				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.6rem',
						marginTop: '0.4rem',
					}}>
					{success && (
						<span
							style={{
								color: '#4ade80',
								fontSize: '0.82rem',
							}}>
							{success}
						</span>
					)}
					{serverError && (
						<span style={errTextLine}>{serverError}</span>
					)}
					{anyError && !saving && (
						<span style={errTextLine}>
							Fix field errors before saving.
						</span>
					)}
					<button
						type="submit"
						disabled={saving}
						title={
							saving
								? 'Save in flight — wait for the current request to finish.'
								: 'Push the current form values to the discordsh_config vault row.'
						}
						style={{
							...primaryBtn(!saving),
							marginLeft: 'auto',
						}}>
						{saving ? (
							<Loader2 size={14} style={spinIcon} />
						) : (
							<Save size={14} />
						)}
						{saving ? 'Saving…' : 'Save config'}
					</button>
				</div>
			</form>
		</section>
	);
}

interface TextFieldProps {
	label: string;
	hint?: string;
	name: string;
	defaultValue: string;
	placeholder?: string;
	inputRef: (el: HTMLInputElement | null) => void;
	onBlur: (e: FocusEvent<HTMLInputElement>) => void;
	error?: string;
	fontMono?: boolean;
	inputMode?: 'text' | 'numeric';
	pattern?: string;
	maxWidth?: number;
}

function TextField(props: TextFieldProps) {
	const {
		label,
		hint,
		name,
		defaultValue,
		placeholder,
		inputRef,
		onBlur,
		error,
		fontMono,
		inputMode,
		pattern,
		maxWidth,
	} = props;
	return (
		<label
			style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
			<span style={fieldLabel}>{label}</span>
			<input
				ref={inputRef}
				name={name}
				defaultValue={defaultValue}
				placeholder={placeholder}
				onBlur={onBlur}
				autoComplete="off"
				spellCheck={false}
				inputMode={inputMode}
				pattern={pattern}
				style={{
					...inputStyle,
					...(fontMono ? mono : null),
					...(maxWidth ? { width: maxWidth } : null),
				}}
			/>
			{hint && !error && <span style={subtle}>{hint}</span>}
			{error && <span style={errText}>{error}</span>}
		</label>
	);
}

interface ChannelPickerProps {
	label: string;
	hint?: string;
	name: string;
	channelType: 'forum' | 'text';
	defaultValue: string;
	channels?: DiscordChannel[];
	loading: boolean;
	sourceError: string | null;
	error?: string;
	inputRef: (el: HTMLInputElement | null) => void;
	onCommit: (value: string) => void;
}

function ChannelPicker(props: ChannelPickerProps) {
	const {
		label,
		hint,
		name,
		channelType,
		defaultValue,
		channels,
		loading,
		sourceError,
		error,
		inputRef,
		onCommit,
	} = props;
	const [showManual, setShowManual] = useState(false);
	const [currentValue, setCurrentValue] = useState<string>(defaultValue);

	useEffect(() => {
		setCurrentValue(defaultValue);
	}, [defaultValue]);

	function commitValue(v: string) {
		setCurrentValue(v);
		onCommit(v);
	}

	const list = channels ?? [];
	const known = list.find((c) => c.id === currentValue);
	const unknownPicked = !!currentValue && !known && !showManual;
	const useManual = showManual || sourceError !== null || unknownPicked;

	return (
		<label
			style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
			<span style={fieldLabel}>{label}</span>
			<input
				ref={inputRef}
				name={name}
				type="hidden"
				value={currentValue}
				readOnly
			/>
			{loading && (
				<span style={subtle}>
					<Loader2
						size={12}
						style={{
							verticalAlign: '-2px',
							marginRight: 4,
							animation: 'spin 1s linear infinite',
						}}
					/>
					Loading channels…
				</span>
			)}
			{!loading && !useManual && list.length > 0 && (
				<select
					value={currentValue}
					onChange={(e) => commitValue(e.target.value)}
					style={{
						...inputStyle,
					}}>
					<option value="">
						— pick a {channelType === 'forum' ? 'forum' : 'text'}{' '}
						channel —
					</option>
					{list.map((c) => (
						<option key={c.id} value={c.id}>
							#{c.name}
						</option>
					))}
				</select>
			)}
			{!loading && useManual && (
				<input
					type="text"
					defaultValue={currentValue}
					placeholder="Discord snowflake (17–20 digits)"
					onBlur={(e) => commitValue(e.target.value.trim())}
					style={{
						...inputStyle,
						...mono,
					}}
					autoComplete="off"
					spellCheck={false}
				/>
			)}
			{!loading && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						fontSize: '0.75rem',
					}}>
					{!useManual && list.length === 0 && !sourceError && (
						<span style={subtle}>
							No {channelType === 'forum' ? 'forum' : 'text'}{' '}
							channels found.
						</span>
					)}
					{sourceError && (
						<span style={{ ...subtle, color: '#facc15' }}>
							<Hash size={11} style={{ verticalAlign: '-1px' }} />{' '}
							Channel lookup failed — paste a raw snowflake.
						</span>
					)}
					{!sourceError && list.length > 0 && (
						<button
							type="button"
							onClick={() => setShowManual((v) => !v)}
							style={{
								background: 'transparent',
								border: 'none',
								color: 'var(--sl-color-gray-3, #9ca0aa)',
								cursor: 'pointer',
								padding: 0,
								fontSize: '0.72rem',
								textDecoration: 'underline',
							}}>
							{useManual
								? 'Use channel picker'
								: 'Paste raw snowflake instead'}
						</button>
					)}
				</div>
			)}
			{hint && !error && <span style={subtle}>{hint}</span>}
			{error && <span style={errText}>{error}</span>}
		</label>
	);
}

const inputStyle: React.CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 6,
	color: 'var(--sl-color-white, #fff)',
	padding: '0.5rem 0.65rem',
	fontSize: '0.9rem',
	boxSizing: 'border-box',
	width: '100%',
};

const mono: React.CSSProperties = {
	fontFamily: 'var(--sl-font-mono, ui-monospace, monospace)',
};

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

const errTextLine: React.CSSProperties = {
	color: '#f87171',
	fontSize: '0.78rem',
};

const toggleRow: React.CSSProperties = {
	display: 'flex',
	alignItems: 'flex-start',
	gap: '0.6rem',
	fontSize: '0.85rem',
	color: 'var(--sl-color-gray-2, #c2c5cc)',
};

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

function primaryBtn(enabled: boolean): React.CSSProperties {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
		padding: '0.5rem 0.95rem',
		borderRadius: 8,
		border: 'none',
		background: enabled ? '#58a6ff' : 'rgba(88,166,255,0.4)',
		color: '#0d1117',
		fontWeight: 600,
		cursor: enabled ? 'pointer' : 'not-allowed',
		fontSize: '0.85rem',
	};
}

const spinIcon: React.CSSProperties = {
	animation: 'spin 1s linear infinite',
};
