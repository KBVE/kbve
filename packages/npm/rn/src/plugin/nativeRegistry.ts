import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { HostBridge } from '../sandbox/bridge';

export interface NativeComponentProps {
	componentId: string;
	bridge: HostBridge;
	fullBleed?: boolean;
	style?: StyleProp<ViewStyle>;
}

export type NativeComponent = ComponentType<NativeComponentProps>;

// Backed by a globalThis singleton: Metro can evaluate this module twice (once
// via the `@kbve/rn` bare specifier from the host app, once via the relative
// path internally), which would otherwise give registrar and reader separate
// Maps. The shared global Map keeps registration visible across both copies.
const REGISTRY_KEY = '__kbveNativeComponentRegistry';
const globalScope = globalThis as unknown as Record<string, unknown>;
const registry: Map<string, NativeComponent> =
	(globalScope[REGISTRY_KEY] as Map<string, NativeComponent>) ??
	new Map<string, NativeComponent>();
globalScope[REGISTRY_KEY] = registry;

export function registerNativeComponent(
	id: string,
	component: NativeComponent,
): void {
	registry.set(id, component);
}

export function unregisterNativeComponent(id: string): void {
	registry.delete(id);
}

export function getNativeComponent(id: string): NativeComponent | undefined {
	return registry.get(id);
}
