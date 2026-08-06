// Resolution target for 'react-native/Libraries/*' internals (Fabric codegen
// helpers). On web these components/commands are never rendered natively; a
// null component keeps the module graph loading.
import { forwardRef } from 'react';

const NullComponent = forwardRef(() => null);

export default function codegenShim(..._args: unknown[]) {
	return NullComponent;
}

export function codegenNativeComponent(_name: string) {
	return NullComponent;
}

export function codegenNativeCommands() {
	return {};
}

export function get(_name: string) {
	return null;
}

export const TurboModuleRegistry = {
	get: (_name: string) => null,
	getEnforcing: (_name: string) => ({}),
};
