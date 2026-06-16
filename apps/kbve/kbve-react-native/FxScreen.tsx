import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { PluginHost, Text } from '@kbve/rn';
import type { HostApiTable } from '@kbve/rn';
import { FX_EFFECTS, makeEffectRegistry } from './fxRegistry';
import { fxSettings } from './fxSettings';
import { FxSlider } from './FxSlider';

/// Host accent exposed through the capability bridge: effects that read
/// `u.accent` (e.g. "Themed") pull this rgb tint via ui:render / accent.
const FX_HOST_API: HostApiTable = {
	'ui:render': { accent: () => [0.25, 0.85, 1.0] },
};

/// FX tab: a full-bleed effect switcher with live speed/intensity controls.
/// Selecting an effect rebuilds a canvas-slot plugin registry, so the chosen
/// TypeGPU effect renders through the plugin host while the previous disposes.
export function FxScreen() {
	const [effectId, setEffectId] = useState(FX_EFFECTS[0].id);
	const [speed, setSpeed] = useState(fxSettings.current.speed);
	const [intensity, setIntensity] = useState(fxSettings.current.intensity);
	const registry = useMemo(
		() => makeEffectRegistry(effectId, 'canvas'),
		[effectId],
	);

	return (
		<View style={styles.root}>
			<PluginHost registry={registry} slot="canvas" api={FX_HOST_API} />
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
			<View style={styles.controls} pointerEvents="box-none">
				<FxSlider
					label="Speed"
					value={speed}
					min={0}
					max={3}
					onChange={(v) => {
						fxSettings.current.speed = v;
						setSpeed(v);
					}}
				/>
				<FxSlider
					label="Intensity"
					value={intensity}
					min={0}
					max={1.5}
					onChange={(v) => {
						fxSettings.current.intensity = v;
						setIntensity(v);
					}}
				/>
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
	controls: {
		position: 'absolute',
		left: 16,
		right: 16,
		bottom: 24,
		gap: 12,
		padding: 16,
		borderRadius: 20,
		backgroundColor: 'rgba(8, 12, 24, 0.6)',
	},
});
