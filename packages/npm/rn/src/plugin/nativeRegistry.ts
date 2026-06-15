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

const registry = new Map<string, NativeComponent>();

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
