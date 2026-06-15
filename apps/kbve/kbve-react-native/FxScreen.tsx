import { useMemo } from 'react';
import {
	PluginHost,
	createPluginRegistry,
	typeGpuGradientManifest,
} from '@kbve/rn';
import './TypeGpuHost';

/// VS2: the GPU effect renders *through* the plugin system — installed,
/// enabled and capability-granted — not mounted directly.
export function FxScreen() {
	const registry = useMemo(() => {
		const r = createPluginRegistry();
		r.dispatch({
			type: 'install',
			manifest: typeGpuGradientManifest,
			grant: ['ui:render'],
		});
		r.dispatch({ type: 'enable', id: typeGpuGradientManifest.id });
		return r;
	}, []);

	return <PluginHost registry={registry} slot="canvas" api={{}} />;
}
