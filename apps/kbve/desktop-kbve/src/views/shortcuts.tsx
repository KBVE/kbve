import { useEffect, useState } from 'react';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { commands, type ShortcutBinding, type PasteMethod } from '../bindings';

const PASTE_METHODS: { value: PasteMethod; label: string }[] = [
	{ value: 'ctrl_v', label: 'Ctrl/Cmd + V' },
	{ value: 'ctrl_shift_v', label: 'Ctrl/Cmd + Shift + V' },
	{ value: 'shift_insert', label: 'Shift + Insert' },
	{ value: 'direct', label: 'Direct typing' },
	{ value: 'none', label: 'None (clipboard only)' },
];

export function ShortcutsSettings() {
	const [bindings, setBindings] = useState<ShortcutBinding[]>([]);
	const [pushToTalk, setPushToTalk] = useState(true);
	const [pasteMethod, setPasteMethod] = useState<PasteMethod>('ctrl_v');
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		const s = await commands.getAppSettings();
		if (s.status === 'ok') {
			setBindings(
				Object.values(s.data.bindings).filter(
					(b): b is ShortcutBinding => !!b,
				),
			);
			setPushToTalk(s.data.push_to_talk);
			setPasteMethod(s.data.paste_method ?? 'ctrl_v');
		} else setError(s.error);
	};

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		load();
	}, []);

	const save = async (id: string, binding: string) => {
		const res = await commands.changeBinding(id, binding);
		if (res.status === 'error') setError(res.error);
		load();
	};

	const reset = async (id: string) => {
		await commands.resetBinding(id);
		load();
	};

	return (
		<>
			{error && <div className="alert-danger text-caption">{error}</div>}
			<SettingsCard title="Global Shortcuts">
				{bindings.length === 0 && (
					<p
						className="px-5 py-4 text-caption"
						style={{ color: 'var(--color-text-muted)' }}>
						Loading shortcuts…
					</p>
				)}
				{bindings.map((b) => (
					<SettingsRow
						key={b.id}
						label={b.name}
						description={b.description}>
						<BindingEditor
							key={b.current_binding}
							binding={b}
							onSave={(v) => save(b.id, v)}
							onReset={() => reset(b.id)}
						/>
					</SettingsRow>
				))}
			</SettingsCard>

			<SettingsCard title="Behavior">
				<SettingsRow
					label="Push to talk"
					description="Hold the shortcut to record; release to transcribe. Off = toggle mode.">
					<ToggleSwitch
						checked={pushToTalk}
						onChange={(v) => {
							setPushToTalk(v);
							commands.changePttSetting(v);
						}}
					/>
				</SettingsRow>
				<SettingsRow
					label="Paste method"
					description="How transcribed text is inserted into the focused app">
					<select
						className="control"
						value={pasteMethod}
						onChange={(e) => {
							const v = e.target.value as PasteMethod;
							setPasteMethod(v);
							commands.changePasteMethodSetting(v);
						}}>
						{PASTE_METHODS.map((m) => (
							<option key={m.value} value={m.value}>
								{m.label}
							</option>
						))}
					</select>
				</SettingsRow>
			</SettingsCard>
		</>
	);
}

function BindingEditor({
	binding,
	onSave,
	onReset,
}: {
	binding: ShortcutBinding;
	onSave: (value: string) => void;
	onReset: () => void;
}) {
	const [value, setValue] = useState(binding.current_binding);
	const dirty = value !== binding.current_binding;

	return (
		<div className="flex items-center gap-2">
			<input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				spellCheck={false}
				className="control w-40 font-mono"
				placeholder="e.g. ctrl+space"
			/>
			<button
				onClick={() => onSave(value)}
				disabled={!dirty}
				className="btn btn-primary">
				Save
			</button>
			<button
				onClick={onReset}
				className="text-caption"
				style={{ color: 'var(--color-text-muted)' }}>
				Reset
			</button>
		</div>
	);
}
