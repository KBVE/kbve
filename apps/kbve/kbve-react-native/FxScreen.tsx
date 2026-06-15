import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { PluginHost, Text } from '@kbve/rn';
import { FX_EFFECTS, makeEffectRegistry } from './fxRegistry';

/// FX tab: a full-bleed effect switcher. Selecting an effect rebuilds a
/// canvas-slot plugin registry, so the chosen TypeGPU effect renders through
/// the plugin host while the previous one disposes on unmount.
export function FxScreen() {
	const [effectId, setEffectId] = useState(FX_EFFECTS[0].id);
	const registry = useMemo(
		() => makeEffectRegistry(effectId, 'canvas'),
		[effectId],
	);

	return (
		<View style={styles.root}>
			<PluginHost registry={registry} slot="canvas" api={{}} />
			<View style={styles.picker} pointerEvents="box-none">
				{FX_EFFECTS.map((effect) => {
					const active = effect.id === effectId;
					return (
						<Pressable
							key={effect.id}
							onPress={() => setEffectId(effect.id)}
							style={[styles.chip, active && styles.chipActive]}>
							<Text
								variant="label"
								tone={active ? 'primary' : 'muted'}>
								{effect.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	picker: {
		position: 'absolute',
		top: 16,
		alignSelf: 'center',
		flexDirection: 'row',
		gap: 8,
		padding: 6,
		borderRadius: 999,
		backgroundColor: 'rgba(8, 12, 24, 0.55)',
	},
	chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
	chipActive: { backgroundColor: 'rgba(255, 255, 255, 0.14)' },
});
