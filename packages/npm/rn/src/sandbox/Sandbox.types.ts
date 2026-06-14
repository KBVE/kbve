import type { StyleProp, ViewStyle } from 'react-native';
import type { Capability } from '../plugin/capability';
import type { PluginManifest } from '../plugin/manifest';
import type { HostApiTable } from './bridge';
import type { SandboxCallbacks } from './controller';

export interface SandboxProps {
	manifest: PluginManifest;
	granted: readonly Capability[];
	api: HostApiTable;
	callbacks?: SandboxCallbacks;
	style?: StyleProp<ViewStyle>;
}

export interface SandboxHandle {
	emit: (topic: string, payload: unknown) => void;
}
