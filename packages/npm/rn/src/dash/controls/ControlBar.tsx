import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Stack, Text, tokens, Select } from '../_ui';
import type { StreamControl, StreamStore } from '../types';

export function resolveSelectOptions(
	control: Extract<StreamControl, { kind: 'select' }>,
	meta: unknown,
): { label: string; value: string }[] {
	if (control.options?.length) return control.options;
	if (control.optionsFromMeta) return control.optionsFromMeta(meta);
	return [];
}

interface ControlBarProps<T> {
	store: StreamStore<T>;
	controls: readonly StreamControl[];
	params: Record<string, string | number | undefined>;
	meta: unknown;
}

export function ControlBar<T>({ store, controls, params, meta }: ControlBarProps<T>) {
	return (
		<Stack direction="row" gap="sm" align="center" wrap>
			{controls.map((c) => {
				if (c.kind === 'segmented') {
					return (
						<Stack key={c.param} direction="row" gap="xs">
							{c.options.map((o) => {
								const on = params[c.param] === o.value;
								return (
									<Pressable
										key={String(o.value)}
										onPress={() => store.setParams({ [c.param]: o.value })}
										style={[styles.seg, on ? styles.segOn : null]}>
										<Text variant="caption" weight={on ? 'medium' : undefined}
											style={{ color: on ? tokens.color.onPrimary : tokens.color.textMuted }}>
											{o.label}
										</Text>
									</Pressable>
								);
							})}
						</Stack>
					);
				}
				if (c.kind === 'select') {
					const opts = resolveSelectOptions(c, meta);
					return (
						<Select
							key={c.param}
							value={params[c.param] as string | undefined}
							placeholder={c.placeholder ?? c.label}
							options={opts}
							onValueChange={(v) => store.setParams({ [c.param]: v || undefined })}
						/>
					);
				}
				return (
					<SearchControl
						key={c.param}
						value={(params[c.param] as string) ?? ''}
						placeholder={c.placeholder ?? 'Search…'}
						debounceMs={c.debounceMs ?? 300}
						onChange={(v) => store.setParams({ [c.param]: v || undefined })}
					/>
				);
			})}
		</Stack>
	);
}

function SearchControl({ value, placeholder, debounceMs, onChange }: {
	value: string; placeholder: string; debounceMs: number; onChange: (v: string) => void;
}) {
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	useEffect(() => {
		const t = setTimeout(() => { if (text !== value) onChange(text); }, debounceMs);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [text, debounceMs]);
	return (
		<TextInput
			value={text}
			onChangeText={setText}
			placeholder={placeholder}
			placeholderTextColor={tokens.color.textFaint}
			style={styles.search}
		/>
	);
}

const styles = StyleSheet.create({
	seg: { paddingHorizontal: tokens.space.md, paddingVertical: 4, borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: tokens.color.border },
	segOn: { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary },
	search: { minWidth: 160, paddingHorizontal: tokens.space.md, paddingVertical: 6, color: tokens.color.text, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.border },
});
