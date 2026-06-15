import {
	requireNativeModule,
	requireNativeViewManager,
} from 'expo-modules-core';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export interface KbveWgpuViewProps extends ViewProps {
	componentId: string;
	onReady?: (event: { nativeEvent: { ok: boolean } }) => void;
	onHostCall?: (event: {
		nativeEvent: {
			id: number;
			capability: string;
			method: string;
			params: string;
		};
	}) => void;
}

export const KbveWgpuView: ComponentType<KbveWgpuViewProps> =
	requireNativeViewManager('KbveWgpuModule');

interface KbveWgpuNativeModule {
	setJwt(jwt: string): void;
	goOnline(serverUrl: string, jwt: string): void;
	hostResponse(id: number, ok: boolean, payload: string): void;
}

export const KbveWgpuModule: KbveWgpuNativeModule =
	requireNativeModule('KbveWgpuModule');

export function setJwt(jwt: string): void {
	KbveWgpuModule.setJwt(jwt);
}

export function goOnline(serverUrl: string, jwt: string): void {
	KbveWgpuModule.goOnline(serverUrl, jwt);
}
