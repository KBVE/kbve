import { useMemo, useState } from 'react';
import { AlertTriangle, Play, Terminal, Trash2 } from 'lucide-react';
import { execRcon } from '@/lib/rcon-client';
import { commandsForServer, type CommandDef, type Tier } from './commands';

export type McServer = 'velocity' | 'lobby' | 'survival';

interface LogEntry {
	id: number;
	ts: number;
	command: string;
	args: string[];
	ok: boolean;
	output: string;
	error?: string;
	latency_ms: number;
}

const TIER_TINT: Record<Tier, { bg: string; fg: string; border: string }> = {
	read: {
		bg: 'rgba(63, 185, 80, 0.10)',
		fg: 'var(--sl-color-green, #3fb950)',
		border: 'rgba(63, 185, 80, 0.35)',
	},
	write: {
		bg: 'rgba(47, 129, 247, 0.10)',
		fg: 'var(--sl-color-accent, #2f81f7)',
		border: 'rgba(47, 129, 247, 0.35)',
	},
	destructive: {
		bg: 'rgba(248, 81, 73, 0.10)',
		fg: 'var(--sl-color-red, #f85149)',
		border: 'rgba(248, 81, 73, 0.4)',
	},
};

const TIERS: Tier[] = ['read', 'write', 'destructive'];
const TIER_LABEL: Record<Tier, string> = {
	read: 'Read',
	write: 'Write',
	destructive: 'Destructive',
};

const styles = {
	root: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.75rem',
		padding: '1rem',
		borderRadius: '0.75rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'var(--sl-color-bg-sidebar, rgba(13, 17, 23, 0.4))',
	},
	headerRow: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		fontSize: '0.85rem',
		fontWeight: 600,
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	tabs: {
		display: 'flex',
		gap: '0.25rem',
		padding: '0.25rem',
		borderRadius: '0.5rem',
		background: 'rgba(13, 17, 23, 0.4)',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
	},
	tab: (active: boolean, tier: Tier): React.CSSProperties => ({
		flex: 1,
		padding: '0.35rem 0.6rem',
		borderRadius: '0.35rem',
		border: 'none',
		fontSize: '0.8rem',
		fontWeight: 600,
		cursor: 'pointer',
		background: active ? TIER_TINT[tier].bg : 'transparent',
		color: active ? TIER_TINT[tier].fg : 'var(--sl-color-gray-3, #8b949e)',
	}),
	commandSelect: {
		width: '100%',
		padding: '0.4rem 0.6rem',
		borderRadius: '0.4rem',
		background: 'var(--sl-color-bg, #0d1117)',
		color: 'var(--sl-color-text, #e6edf3)',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		fontSize: '0.85rem',
	},
	description: {
		margin: 0,
		fontSize: '0.78rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	argRow: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.25rem',
	},
	argLabel: {
		fontSize: '0.72rem',
		fontWeight: 600,
		textTransform: 'uppercase' as const,
		color: 'var(--sl-color-gray-3, #8b949e)',
		letterSpacing: '0.04em',
	},
	argInput: {
		padding: '0.4rem 0.55rem',
		borderRadius: '0.35rem',
		background: 'var(--sl-color-bg, #0d1117)',
		color: 'var(--sl-color-text, #e6edf3)',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		fontSize: '0.85rem',
		fontFamily: 'var(--sl-font-mono, monospace)',
	},
	actions: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		gap: '0.5rem',
	},
	runBtn: (tier: Tier, disabled: boolean): React.CSSProperties => ({
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
		padding: '0.4rem 0.85rem',
		borderRadius: '0.4rem',
		border: `1px solid ${TIER_TINT[tier].border}`,
		background: disabled ? 'rgba(48, 54, 61, 0.4)' : TIER_TINT[tier].bg,
		color: disabled
			? 'var(--sl-color-gray-3, #8b949e)'
			: TIER_TINT[tier].fg,
		fontWeight: 600,
		fontSize: '0.85rem',
		cursor: disabled ? 'not-allowed' : 'pointer',
	}),
	clearBtn: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.35rem',
		padding: '0.3rem 0.6rem',
		borderRadius: '0.4rem',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		background: 'transparent',
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.78rem',
		cursor: 'pointer',
	},
	log: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.4rem',
		maxHeight: '18rem',
		overflowY: 'auto' as const,
		padding: '0.6rem',
		borderRadius: '0.5rem',
		background: 'rgba(0, 0, 0, 0.35)',
		border: '1px solid var(--sl-color-gray-5, #30363d)',
		fontFamily: 'var(--sl-font-mono, monospace)',
		fontSize: '0.8rem',
	},
	logEmpty: {
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontStyle: 'italic' as const,
		textAlign: 'center' as const,
		padding: '0.5rem',
	},
	logEntry: (ok: boolean): React.CSSProperties => ({
		display: 'flex',
		flexDirection: 'column',
		gap: '0.2rem',
		paddingLeft: '0.5rem',
		borderLeft: `2px solid ${
			ok ? 'rgba(63, 185, 80, 0.5)' : 'rgba(248, 81, 73, 0.5)'
		}`,
	}),
	logMeta: {
		display: 'flex',
		justifyContent: 'space-between',
		gap: '0.5rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		fontSize: '0.7rem',
	},
	logCmd: {
		color: 'var(--sl-color-text, #e6edf3)',
		whiteSpace: 'pre-wrap' as const,
	},
	logOutput: (ok: boolean): React.CSSProperties => ({
		whiteSpace: 'pre-wrap',
		color: ok
			? 'var(--sl-color-text, #e6edf3)'
			: 'var(--sl-color-red, #f85149)',
	}),
};

interface Props {
	server: McServer;
}

let entryId = 0;

export default function RconConsole({ server }: Props) {
	const commands = useMemo(() => commandsForServer(server), [server]);
	const [tier, setTier] = useState<Tier>('read');
	const visible = useMemo(
		() => commands.filter((c) => c.tier === tier),
		[commands, tier],
	);
	const [selectedName, setSelectedName] = useState<string>(
		visible[0]?.name ?? '',
	);
	const selected: CommandDef | undefined =
		visible.find((c) => c.name === selectedName) ?? visible[0];
	const [args, setArgs] = useState<string[]>([]);
	const [pending, setPending] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);

	function pickTier(next: Tier) {
		setTier(next);
		const first = commands.find((c) => c.tier === next);
		setSelectedName(first?.name ?? '');
		setArgs([]);
	}

	function pickCommand(name: string) {
		setSelectedName(name);
		setArgs([]);
	}

	function updateArg(index: number, value: string) {
		setArgs((prev) => {
			const next = prev.slice();
			while (next.length <= index) next.push('');
			next[index] = value;
			return next;
		});
	}

	async function run() {
		if (!selected) return;
		const fullArgs = selected.args.map((_, i) => args[i] ?? '');
		if (selected.tier === 'destructive') {
			const summary = [selected.label, ...fullArgs.filter(Boolean)].join(
				' ',
			);
			const ok = window.confirm(
				`Run ${summary} on ${server}? This is a destructive command.`,
			);
			if (!ok) return;
		}
		setPending(true);
		const ts = Date.now();
		try {
			const res = await execRcon('mc', server, {
				command: selected.name,
				args: fullArgs,
			});
			setLog((prev) =>
				[
					{
						id: ++entryId,
						ts,
						command: selected.name,
						args: fullArgs,
						ok: res.ok,
						output: res.output,
						error: res.error,
						latency_ms: res.latency_ms,
					},
					...prev,
				].slice(0, 50),
			);
		} catch (e: unknown) {
			const err = e as Error;
			setLog((prev) =>
				[
					{
						id: ++entryId,
						ts,
						command: selected.name,
						args: fullArgs,
						ok: false,
						output: '',
						error: err?.message ?? 'request failed',
						latency_ms: 0,
					},
					...prev,
				].slice(0, 50),
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<div style={styles.root}>
			<div style={styles.headerRow}>
				<Terminal size={14} />
				RCON · {server}
			</div>

			<div style={styles.tabs}>
				{TIERS.map((t) => {
					const has = commands.some((c) => c.tier === t);
					if (!has) return null;
					return (
						<button
							key={t}
							type="button"
							style={styles.tab(tier === t, t)}
							onClick={() => pickTier(t)}>
							{TIER_LABEL[t]}
						</button>
					);
				})}
			</div>

			{visible.length === 0 ? (
				<p style={styles.description}>
					No {TIER_LABEL[tier].toLowerCase()} commands available for{' '}
					{server}.
				</p>
			) : (
				<>
					<select
						style={styles.commandSelect}
						value={selectedName}
						onChange={(e) => pickCommand(e.target.value)}>
						{visible.map((c) => (
							<option key={c.name} value={c.name}>
								{c.label} ({c.name})
							</option>
						))}
					</select>

					{selected && (
						<p style={styles.description}>{selected.description}</p>
					)}

					{selected?.args.map((arg, i) => (
						<div key={i} style={styles.argRow}>
							<span style={styles.argLabel}>{arg.label}</span>
							<input
								style={styles.argInput}
								type="text"
								placeholder={arg.placeholder}
								value={args[i] ?? ''}
								onChange={(e) => updateArg(i, e.target.value)}
							/>
						</div>
					))}

					<div style={styles.actions}>
						<button
							type="button"
							style={styles.runBtn(tier, pending || !selected)}
							onClick={run}
							disabled={pending || !selected}>
							{tier === 'destructive' && (
								<AlertTriangle size={14} />
							)}
							{tier !== 'destructive' && <Play size={14} />}
							{pending
								? 'Running…'
								: `Run ${selected?.label ?? ''}`}
						</button>
						{log.length > 0 && (
							<button
								type="button"
								style={styles.clearBtn}
								onClick={() => setLog([])}>
								<Trash2 size={12} /> Clear log
							</button>
						)}
					</div>
				</>
			)}

			<div style={styles.log}>
				{log.length === 0 ? (
					<div style={styles.logEmpty}>No commands run yet.</div>
				) : (
					log.map((entry) => (
						<div key={entry.id} style={styles.logEntry(entry.ok)}>
							<div style={styles.logMeta}>
								<span>
									{new Date(entry.ts).toLocaleTimeString()} ·{' '}
									{entry.command}
								</span>
								<span>
									{entry.ok
										? `${entry.latency_ms}ms`
										: 'failed'}
								</span>
							</div>
							{entry.args.length > 0 && (
								<div style={styles.logCmd}>
									args: [
									{entry.args
										.map((a) => JSON.stringify(a))
										.join(', ')}
									]
								</div>
							)}
							<div style={styles.logOutput(entry.ok)}>
								{entry.ok
									? entry.output || '(empty)'
									: (entry.error ?? 'failed')}
							</div>
						</div>
					))
				)}
			</div>
		</div>
	);
}
