import { useMemo, useState } from 'react';
import {
	Alert,
	Platform,
	Pressable,
	StyleSheet,
	TextInput,
	View,
} from 'react-native';
import { Badge, Select, Stack, Surface, Text, tokens } from '../_ui';
import { commandsForServer } from './commands';
import type { CommandDef, Tier } from './commands';
import type { RconExecFn } from './rconExec';

export interface LogEntry {
	id: number;
	ts: number;
	command: string;
	args: string[];
	ok: boolean;
	output: string;
	error?: string;
	latency_ms: number;
}

let entryId = 0;

export function appendLog(
	log: LogEntry[],
	entry: Omit<LogEntry, 'id'>,
): LogEntry[] {
	return [{ ...entry, id: ++entryId }, ...log].slice(0, 50);
}

export function confirmDestructive(message: string): Promise<boolean> {
	if (Platform.OS === 'web') {
		return Promise.resolve(
			typeof window !== 'undefined' ? window.confirm(message) : false,
		);
	}
	return new Promise((resolve) => {
		Alert.alert('Destructive command', message, [
			{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
			{ text: 'Run', style: 'destructive', onPress: () => resolve(true) },
		]);
	});
}

const TIERS: Tier[] = ['read', 'write', 'destructive'];
const TIER_LABEL: Record<Tier, string> = {
	read: 'Read',
	write: 'Write',
	destructive: 'Destructive',
};

export function RconConsole({
	server,
	exec,
}: {
	server: string;
	exec: RconExecFn;
}) {
	const commands = useMemo(() => commandsForServer(server), [server]);
	const [tier, setTier] = useState<Tier>('read');
	const visible = useMemo(
		() => commands.filter((c) => c.tier === tier),
		[commands, tier],
	);
	const [selectedName, setSelectedName] = useState('');
	const selected: CommandDef | undefined =
		visible.find((c) => c.name === selectedName) ?? visible[0];
	const [args, setArgs] = useState<string[]>([]);
	const [pending, setPending] = useState(false);
	const [log, setLog] = useState<LogEntry[]>([]);

	const pickTier = (next: Tier) => {
		setTier(next);
		setSelectedName('');
		setArgs([]);
	};

	const updateArg = (index: number, value: string) => {
		setArgs((prev) => {
			const next = prev.slice();
			while (next.length <= index) next.push('');
			next[index] = value;
			return next;
		});
	};

	const run = async () => {
		if (!selected || pending) return;
		const fullArgs = selected.args.map((_, i) => args[i] ?? '');
		if (selected.tier === 'destructive') {
			const summary = [selected.label, ...fullArgs.filter(Boolean)].join(' ');
			const ok = await confirmDestructive(`Run ${summary} on ${server}?`);
			if (!ok) return;
		}
		setPending(true);
		const ts = Date.now();
		const res = await exec(server, {
			command: selected.name,
			args: fullArgs,
		});
		setLog((prev) =>
			appendLog(prev, {
				ts,
				command: selected.name,
				args: fullArgs,
				ok: res.ok,
				output: res.output,
				error: res.error,
				latency_ms: res.latency_ms,
			}),
		);
		setPending(false);
	};

	return (
		<Surface style={styles.root}>
			<Stack gap="sm">
				<Text variant="caption" tone="muted">
					RCON · {server}
				</Text>
				<Stack direction="row" gap="xs">
					{TIERS.map((t) =>
						commands.some((c) => c.tier === t) ? (
							<Pressable
								key={t}
								onPress={() => pickTier(t)}
								style={[
									styles.tab,
									tier === t && styles.tabActive,
								]}>
								<Text
									variant="caption"
									tone={tier === t ? 'default' : 'muted'}>
									{TIER_LABEL[t]}
								</Text>
							</Pressable>
						) : null,
					)}
				</Stack>
				<Select
					value={selected?.name ?? ''}
					options={visible.map((c) => ({
						label: `${c.label} (${c.name})`,
						value: c.name,
					}))}
					placeholder="command"
					onValueChange={(name) => {
						setSelectedName(name);
						setArgs([]);
					}}
				/>
				{selected && (
					<Text variant="caption" tone="faint">
						{selected.description}
					</Text>
				)}
				{selected?.args.map((arg, i) => (
					<View key={`${selected.name}:${i}`} style={styles.argRow}>
						<Text variant="caption" tone="muted">
							{arg.label}
						</Text>
						<TextInput
							style={styles.input}
							placeholder={arg.placeholder}
							placeholderTextColor={tokens.color.textFaint}
							value={args[i] ?? ''}
							onChangeText={(v) => updateArg(i, v)}
						/>
					</View>
				))}
				<Stack direction="row" gap="sm" align="center">
					<Pressable
						onPress={run}
						disabled={pending || !selected}
						style={[
							styles.runBtn,
							(pending || !selected) && styles.runBtnDisabled,
						]}>
						<Text variant="caption">
							{pending ? 'Running…' : `Run ${selected?.label ?? ''}`}
						</Text>
					</Pressable>
					{log.length > 0 && (
						<Pressable onPress={() => setLog([])}>
							<Text variant="caption" tone="faint">
								Clear log
							</Text>
						</Pressable>
					)}
				</Stack>
				<Stack gap="xs" style={styles.log}>
					{log.length === 0 ? (
						<Text variant="caption" tone="faint">
							No commands run yet.
						</Text>
					) : (
						log.map((entry) => (
							<View key={entry.id} style={styles.logEntry}>
								<Stack
									direction="row"
									justify="space-between"
									gap="sm">
									<Text variant="caption" tone="muted">
										{new Date(entry.ts).toLocaleTimeString()} ·{' '}
										{entry.command}
									</Text>
									<Badge
										label={
											entry.ok
												? `${entry.latency_ms}ms`
												: 'failed'
										}
										tone={entry.ok ? 'success' : 'danger'}
									/>
								</Stack>
								<Text
									variant="caption"
									tone={entry.ok ? 'default' : 'muted'}>
									{entry.ok
										? entry.output || '(empty)'
										: (entry.error ?? 'failed')}
								</Text>
							</View>
						))
					)}
				</Stack>
			</Stack>
		</Surface>
	);
}

const styles = StyleSheet.create({
	root: { padding: tokens.space.md },
	tab: {
		paddingVertical: tokens.space.xs,
		paddingHorizontal: tokens.space.sm,
		borderRadius: tokens.radius.sm,
		borderWidth: 1,
		borderColor: tokens.color.border,
	},
	tabActive: {
		backgroundColor: tokens.color.surfaceAlt,
		borderColor: tokens.color.primary,
	},
	argRow: { gap: 4 },
	input: {
		borderWidth: 1,
		borderColor: tokens.color.border,
		borderRadius: tokens.radius.sm,
		paddingHorizontal: tokens.space.sm,
		paddingVertical: tokens.space.xs,
		color: tokens.color.text,
	},
	runBtn: {
		paddingVertical: tokens.space.xs,
		paddingHorizontal: tokens.space.md,
		borderRadius: tokens.radius.sm,
		borderWidth: 1,
		borderColor: tokens.color.primary,
	},
	runBtnDisabled: { opacity: 0.5 },
	log: { maxHeight: 280, overflow: 'hidden' },
	logEntry: {
		borderLeftWidth: 2,
		borderLeftColor: tokens.color.border,
		paddingLeft: tokens.space.sm,
		gap: 2,
	},
});
