import type { PluginManifest } from '../plugin/manifest';

const SOURCE = `
window.__kbvePluginMain = function (kbve) {
	var count = 0;
	function paint() {
		kbve.render([
			{
				kind: 'card',
				id: 'hello-counter',
				variant: 'stat',
				title: 'Hello from sandbox',
				subtitle: kbve.pluginId(),
				statValue: String(count),
				actions: [
					{ id: 'inc', label: 'Increment', execute: function () {} },
				],
			},
		]);
	}
	if (kbve.can('storage:read')) {
		kbve.call('storage:read', 'get', { key: 'count' }).then(function (v) {
			count = v ? parseInt(v, 10) || 0 : 0;
			paint();
		});
	} else {
		paint();
	}
	if (kbve.can('notify')) {
		kbve.call('notify', 'toast', { message: 'Hello plugin loaded', tone: 'success' });
	}
	kbve.on('tick', function () {
		count += 1;
		if (kbve.can('storage:write')) {
			kbve.call('storage:write', 'set', { key: 'count', value: String(count) });
		}
		paint();
	});
	paint();
	kbve.ready();
};
`;

export const helloPluginManifest: PluginManifest = {
	id: 'kbve.hello',
	name: 'Hello Sandbox',
	version: '0.0.1',
	description: 'Reference micro-app: renders a native card and counts ticks.',
	author: 'KBVE',
	entry: { kind: 'inline-js', source: SOURCE },
	permissions: ['ui:render', 'notify', 'storage:read', 'storage:write'],
	surfaces: [{ slot: 'panel', title: 'Hello' }],
};
