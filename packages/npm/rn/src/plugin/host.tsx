import { memo, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { tokens } from '../ui/theme';
import { Text } from '../ui/primitives/Text';
import { Surface } from '../ui/primitives/Surface';
import { EntityRenderer } from '../ui/EntityRenderer';
import type { UIEntity } from '../ui/models';
import { Sandbox } from '../sandbox/Sandbox';
import type { HostApiTable } from '../sandbox/bridge';
import { isSandboxed } from './manifest';
import type { PluginSurfaceSlot } from './manifest';
import type { InstalledPlugin, PluginRegistry } from './registry';

export function usePluginRegistry(registry: PluginRegistry) {
	return useSyncExternalStore(
		registry.subscribe,
		registry.getSnapshot,
		registry.getSnapshot,
	);
}

const PluginFrame = memo(function PluginFrame({
	plugin,
	api,
}: {
	plugin: InstalledPlugin;
	api: HostApiTable;
}) {
	const [entities, setEntities] = useState<UIEntity[]>([]);
	const [error, setError] = useState<string | null>(null);

	if (!isSandboxed(plugin.manifest.entry)) {
		return (
			<Surface>
				<Text variant="label">{plugin.manifest.name}</Text>
				<Text variant="caption" tone="muted">
					native entry — no host component registered
				</Text>
			</Surface>
		);
	}

	return (
		<View style={styles.frame}>
			<Sandbox
				manifest={plugin.manifest}
				granted={plugin.granted}
				api={api}
				style={styles.sandbox}
				callbacks={{
					onRender: setEntities,
					onError: setError,
				}}
			/>
			{error ? (
				<Text variant="caption" tone="danger">
					{error}
				</Text>
			) : null}
			{entities.map((entity) => (
				<EntityRenderer key={entity.id} entity={entity} />
			))}
		</View>
	);
});

export const PluginHost = memo(function PluginHost({
	registry,
	slot,
	api,
}: {
	registry: PluginRegistry;
	slot: PluginSurfaceSlot;
	api: HostApiTable;
}) {
	const view = usePluginRegistry(registry);
	const plugins = view.bySurface[slot];
	if (!plugins.length) return null;
	return (
		<View style={styles.host}>
			{plugins.map((plugin) => (
				<PluginFrame
					key={plugin.manifest.id}
					plugin={plugin}
					api={api}
				/>
			))}
		</View>
	);
});

const styles = StyleSheet.create({
	host: { gap: tokens.space.md },
	frame: { gap: tokens.space.sm },
	sandbox: { minHeight: 1, width: '100%' },
});
