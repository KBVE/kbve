import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { registerNativeComponent, useKbve, WGPU_COMPONENT_ID } from '@kbve/rn';
import type { NativeComponentProps } from '@kbve/rn';
import { KbveWgpuModule, KbveWgpuView, setJwt } from './modules/kbve-wgpu';
import type { KbveWgpuViewProps } from './modules/kbve-wgpu';

function WgpuHost({ componentId, bridge, style }: NativeComponentProps) {
	const { client } = useKbve();

	useEffect(() => {
		let active = true;
		client.auth.getSession().then(({ data }) => {
			const token = data.session?.access_token;
			if (active && token) setJwt(token);
		});
		const { data } = client.auth.onAuthStateChange((_event, session) => {
			if (session?.access_token) setJwt(session.access_token);
		});
		return () => {
			active = false;
			data.subscription.unsubscribe();
		};
	}, [client]);

	const onHostCall = useCallback<
		NonNullable<KbveWgpuViewProps['onHostCall']>
	>(
		async (event) => {
			const { id, capability, method, params } = event.nativeEvent;
			try {
				const parsed = params ? JSON.parse(params) : undefined;
				const result = await bridge.invoke(
					capability as never,
					method,
					parsed,
				);
				KbveWgpuModule.hostResponse(
					id,
					true,
					JSON.stringify(result ?? null),
				);
			} catch (error) {
				KbveWgpuModule.hostResponse(
					id,
					false,
					error instanceof Error ? error.message : String(error),
				);
			}
		},
		[bridge],
	);

	return (
		<View style={[styles.fill, style]}>
			<KbveWgpuView
				style={styles.fill}
				componentId={componentId}
				onHostCall={onHostCall}
			/>
		</View>
	);
}

registerNativeComponent(WGPU_COMPONENT_ID, WgpuHost);

export { WgpuHost };

const styles = StyleSheet.create({
	fill: { flex: 1, width: '100%' },
});
