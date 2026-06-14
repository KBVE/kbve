import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { HostBridge } from './bridge';
import { SandboxController } from './controller';
import { buildSandboxHtml, sandboxRuntimeScript } from './runtime';
import type { SandboxHandle, SandboxProps } from './Sandbox.types';

export type { SandboxHandle, SandboxProps } from './Sandbox.types';

export const Sandbox = forwardRef<SandboxHandle, SandboxProps>(function Sandbox(
	{ manifest, granted, api, callbacks, style },
	ref,
) {
	const webRef = useRef<WebView>(null);
	const entry = manifest.entry;
	const hostedPage = entry.kind === 'url-page';
	const html = useMemo(
		() => (hostedPage ? '' : buildSandboxHtml(entry)),
		[hostedPage, entry],
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

	const injectBridge = hostedPage && entry.injectBridge !== false;
	const source = hostedPage ? { uri: entry.url } : { html };

	return (
		<WebView
			ref={webRef}
			style={[styles.web, style]}
			originWhitelist={['*']}
			source={source}
			javaScriptEnabled
			domStorageEnabled
			injectedJavaScriptBeforeContentLoaded={
				injectBridge ? sandboxRuntimeScript() : undefined
			}
			onLoadEnd={() => {
				if (!hostedPage || injectBridge) controller.init();
			}}
			onMessage={(event: WebViewMessageEvent) =>
				controller.handleRaw(event.nativeEvent.data)
			}
		/>
	);
});

const styles = StyleSheet.create({
	web: { flex: 1, backgroundColor: 'transparent' },
});
