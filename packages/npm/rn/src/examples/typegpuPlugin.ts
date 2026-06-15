import type { PluginManifest, PluginSurfaceSlot } from '../plugin/manifest';

export const TYPEGPU_COMPONENT_ID = 'kbve.typegpu';

export function createTypeGpuPlugin(
	effectId: string,
	slot: PluginSurfaceSlot = 'canvas',
	componentId: string = TYPEGPU_COMPONENT_ID,
): PluginManifest {
	return {
		id: `kbve.typegpu.${effectId}`,
		name: `GPU Effect: ${effectId}`,
		version: '0.1.0',
		description:
			'JS-authored TypeGPU effect rendered on a react-native-webgpu canvas. Separate from the kbve_wgpu game surface.',
		author: 'KBVE',
		entry: { kind: 'typegpu', componentId, effectId },
		permissions: ['ui:render'],
		surfaces: [{ slot, title: 'FX' }],
	};
}

export const typeGpuGradientManifest: PluginManifest =
	createTypeGpuPlugin('gradient');

export const typeGpuAuroraManifest: PluginManifest = createTypeGpuPlugin(
	'aurora',
	'background',
);
