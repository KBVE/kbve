import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
			<View style={styles.pickerWrap} pointerEvents="box-none">
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.picker}>
					{FX_EFFECTS.map((effect) => {
						const active = effect.id === effectId;
						return (
							<Pressable
								key={effect.id}
								onPress={() => setEffectId(effect.id)}
								style={[
									styles.chip,
									active && styles.chipActive,
								]}>
								<Text
									variant="label"
									tone={active ? 'primary' : 'muted'}>
									{effect.label}
								</Text>
							</Pressable>
						);
					})}
				</ScrollView>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	pickerWrap: { position: 'absolute', top: 16, left: 0, right: 0 },
	picker: {
		flexGrow: 1,
		justifyContent: 'center',
		gap: 8,
		paddingHorizontal: 12,
	},
	chip: {
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 999,
		backgroundColor: 'rgba(8, 12, 24, 0.55)',
	},
	chipActive: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
});
