import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
	PluginHost,
	Text,
	createPluginRegistry,
	typeGpuAuroraManifest,
} from '@kbve/rn';
import './TypeGpuHost';

/// VS3: a transparent TypeGPU effect composited *behind* real UI. The aurora
/// plugin renders on a full-bleed background canvas (pointer-transparent) and
/// translucent cards sit on top, so the GPU effect is woven into the screen.
export function FxScreen() {
	const registry = useMemo(() => {
		const r = createPluginRegistry();
		r.dispatch({
			type: 'install',
			manifest: typeGpuAuroraManifest,
			grant: ['ui:render'],
		});
		r.dispatch({ type: 'enable', id: typeGpuAuroraManifest.id });
		return r;
	}, []);

	return (
		<View style={styles.root}>
			<View style={StyleSheet.absoluteFill} pointerEvents="none">
				<PluginHost registry={registry} slot="background" api={{}} />
			</View>
			<ScrollView contentContainerStyle={styles.content}>
				<View style={styles.card}>
					<Text variant="title">GPU Aurora</Text>
					<Text variant="caption" tone="muted">
						TypeGPU effect rendered behind this UI on a native
						react-native-webgpu surface — separate from the
						kbve_wgpu game.
					</Text>
				</View>
				<View style={styles.card}>
					<Text variant="label">Composited</Text>
					<Text variant="caption" tone="muted">
						The canvas is a pointer-transparent background layer;
						scroll and taps pass straight through to the content.
					</Text>
				</View>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	content: { padding: 16, gap: 16, paddingTop: 48 },
	card: {
		gap: 6,
		padding: 16,
		borderRadius: 16,
		backgroundColor: 'rgba(8, 12, 24, 0.55)',
	},
});
