import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from 'react';
import { HostBridge } from './bridge';
import { SandboxController } from './controller';
import { buildSandboxHtml } from './runtime';
import type { SandboxHandle, SandboxProps } from './Sandbox.types';

export type { SandboxHandle, SandboxProps } from './Sandbox.types';

export const Sandbox = forwardRef<SandboxHandle, SandboxProps>(function Sandbox(
	{ manifest, granted, api, callbacks },
	ref,
) {
	const frameRef = useRef<HTMLIFrameElement>(null);
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
				frameRef.current?.contentWindow?.postMessage(raw, '*');
			},
			callbacks,
		});
	}, [manifest, granted, api, callbacks]);

	useImperativeHandle(
		ref,
		() => ({ emit: (topic, payload) => controller.emit(topic, payload) }),
		[controller],
	);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			if (event.source !== frameRef.current?.contentWindow) return;
			if (typeof event.data === 'string')
				controller.handleRaw(event.data);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [controller]);

	const frameSource = hostedPage ? { src: entry.url } : { srcDoc: html };

	return (
		<iframe
			ref={frameRef}
			title={manifest.id}
			{...frameSource}
			sandbox="allow-scripts allow-same-origin"
			onLoad={() => {
				if (!hostedPage) controller.init();
			}}
			style={{ flex: 1, border: 'none', background: 'transparent' }}
		/>
	);
});
