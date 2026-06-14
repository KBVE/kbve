import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { HostBridge } from './bridge';
import { SandboxController } from './controller';
import { buildSandboxHtml } from './runtime';
import type { SandboxHandle, SandboxProps } from './Sandbox.types';

export type { SandboxHandle, SandboxProps } from './Sandbox.types';

export const Sandbox = forwardRef<SandboxHandle, SandboxProps>(function Sandbox(
	{ manifest, granted, api, callbacks, style },
	ref,
) {
	const webRef = useRef<WebView>(null);
	const html = useMemo(
		() => buildSandboxHtml(manifest.entry),
		[manifest.entry],
	);

	const controller = useMemo(() => {
		const bridge = new HostBridge({ manifest, granted, api });
		return new SandboxController({
			pluginId: manifest.id,
			capabilities: [...granted],
			bridge,
			send: (raw) => {
				webRef.current?.injectJavaScript(
					`window.__kbveReceive(${JSON.stringify(raw)});true;`,
				);
			},
			callbacks,
		});
	}, [manifest, granted, api, callbacks]);

	useImperativeHandle(
		ref,
		() => ({ emit: (topic, payload) => controller.emit(topic, payload) }),
		[controller],
	);

	return (
		<WebView
			ref={webRef}
			style={[styles.web, style]}
			originWhitelist={['*']}
			source={{ html }}
			javaScriptEnabled
			onLoadEnd={() => controller.init()}
			onMessage={(event: WebViewMessageEvent) =>
				controller.handleRaw(event.nativeEvent.data)
			}
		/>
	);
});

const styles = StyleSheet.create({
	web: { flex: 1, backgroundColor: 'transparent' },
});
