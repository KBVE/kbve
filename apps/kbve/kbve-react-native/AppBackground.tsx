import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PluginHost } from '@kbve/rn';
import { makeEffectRegistry } from './fxRegistry';

/// App-wide ambient GPU layer: the aurora effect on a pointer-transparent
/// background-slot canvas, mounted behind the whole NavShell.
export function AppBackground() {
	const registry = useMemo(
		() => makeEffectRegistry('aurora', 'background'),
		[],
	);
	return (
		<View style={StyleSheet.absoluteFill} pointerEvents="none">
			<PluginHost registry={registry} slot="background" api={{}} />
		</View>
	);
}
