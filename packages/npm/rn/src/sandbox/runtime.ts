import type { PluginEntry } from '../plugin/manifest';

const RUNTIME = `
(function () {
	var native = typeof window.ReactNativeWebView !== 'undefined';
	function send(msg) {
		var json = JSON.stringify(msg);
		if (native) { window.ReactNativeWebView.postMessage(json); }
		else { parent.postMessage(json, '*'); }
	}
	var nextId = 1;
	var pending = {};
	var topics = {};
	var ctx = { pluginId: null, capabilities: [] };
	var kbve = {
		pluginId: function () { return ctx.pluginId; },
		capabilities: function () { return ctx.capabilities.slice(); },
		can: function (cap) { return ctx.capabilities.indexOf(cap) !== -1; },
		call: function (capability, method, params) {
			var id = nextId++;
			return new Promise(function (resolve, reject) {
				pending[id] = { resolve: resolve, reject: reject };
				send({ kind: 'plugin/call', id: id, capability: capability, method: method, params: params });
			});
		},
		render: function (entities) {
			send({ kind: 'plugin/render', entities: entities || [] });
		},
		on: function (topic, cb) {
			(topics[topic] = topics[topic] || []).push(cb);
		},
		log: function (level, message) {
			send({ kind: 'plugin/log', level: level || 'info', message: String(message) });
		},
		ready: function () { send({ kind: 'plugin/ready' }); },
	};
	window.kbve = kbve;
	function handle(raw) {
		var msg;
		try { msg = JSON.parse(raw); } catch (e) { return; }
		if (msg.kind === 'host/init') {
			ctx.pluginId = msg.pluginId;
			ctx.capabilities = msg.capabilities || [];
			if (typeof window.__kbvePluginMain === 'function') {
				try { window.__kbvePluginMain(kbve); }
				catch (e) { send({ kind: 'plugin/error', message: String(e && e.message || e) }); }
			} else {
				kbve.ready();
			}
			return;
		}
		if (msg.kind === 'host/response') {
			var p = pending[msg.id];
			if (!p) return;
			delete pending[msg.id];
			if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error));
			return;
		}
		if (msg.kind === 'host/event') {
			var list = topics[msg.topic] || [];
			for (var i = 0; i < list.length; i++) {
				try { list[i](msg.payload); } catch (e) {}
			}
		}
	}
	window.__kbveReceive = handle;
	window.addEventListener('message', function (ev) {
		if (typeof ev.data === 'string') handle(ev.data);
	});
	window.onerror = function (message) {
		send({ kind: 'plugin/error', message: String(message) });
	};
})();
`;

function loaderFor(entry: PluginEntry): string {
	switch (entry.kind) {
		case 'inline-js':
			return `<script>\n${entry.source}\n</script>`;
		case 'url-js':
			return `<script src="${entry.url}"></script>`;
		case 'wasm':
			return `<script>
(function () {
	var exportName = ${JSON.stringify(entry.exportName ?? 'kbve_main')};
	window.__kbvePluginMain = function (kbve) {
		WebAssembly.instantiateStreaming(fetch(${JSON.stringify(entry.url)}), {
			env: {
				kbve_log: function (level, ptr, len) {
					kbve.log('info', readString(instance, ptr, len));
				},
			},
		}).then(function (result) {
			var instance = result.instance;
			window.__kbveWasm = instance;
			if (typeof instance.exports[exportName] === 'function') {
				instance.exports[exportName]();
			}
			kbve.ready();
		}).catch(function (e) {
			kbve.log('error', 'wasm load failed: ' + (e && e.message || e));
		});
	};
	function readString(instance, ptr, len) {
		var mem = new Uint8Array(instance.exports.memory.buffer, ptr, len);
		return new TextDecoder().decode(mem);
	}
})();
</script>`;
		case 'url-page':
		case 'native':
			return '';
	}
}

export function sandboxRuntimeScript(): string {
	return RUNTIME;
}

export function buildSandboxHtml(entry: PluginEntry): string {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body{margin:0;padding:0;background:transparent;}</style>
</head>
<body>
<script>${RUNTIME}</script>
${loaderFor(entry)}
</body>
</html>`;
}
