<script lang="ts">
    import { proxy } from 'comlink';

	let key = $state('');
	let value = $state('');
	let response = $state('');

	function getWsUrl() {
		const isLocal =
			location.hostname === 'localhost' ||
			location.hostname === '127.0.0.1';
		return isLocal ? 'ws://localhost:3000/ws' : `wss://${location.host}/ws`;
	}

	let isConnected = false;

	function _guard(): boolean {
		return (
			typeof window !== 'undefined' &&
			!!window.kbve?.ws &&
			!!window.kbve?.data?.redis
		);
	}

	async function ensureConnection() {
		if (!_guard() || !window.kbve) return;

		const kbve = window.kbve;

		if (!isConnected) {
			await kbve.ws.connect(getWsUrl());
			isConnected = true;
		}
	}

	async function sendSet() {
		await ensureConnection();
		if (!_guard() || !window.kbve) return;
		const envelope = window.kbve.data.redis.wrapRedisSet(key, value);
		await window.kbve.ws.send(envelope);
		response = `[SET] Sent key "${key}"`;
	}

	async function sendGet() {
		await ensureConnection();
		if (!_guard() || !window.kbve) return;
		const envelope = window.kbve.data.redis.wrapRedisGet(key);
		window.kbve.ws.onMessage(proxy((msg) => {
            try {
                // If msg is still a buffer (Uint8Array), inspect it
                if (msg instanceof Uint8Array) {
                    if (!_guard() || !window.kbve) return;
                    window.kbve.data.inspectFlex(msg);
                    response = '[GET] Received Flexbuffer. See console log for details.';
                } else {
                    // fallback to pretty-print JSON
                    response = JSON.stringify(msg, null, 2);
                }
            } catch (err) {
                console.warn('[WS] Failed to handle message:', err);
                response = '[GET] Received uninspectable message.';
            }
        }));
		await window.kbve.ws.send(envelope);
		response = `[GET] Requested "${key}"`;
	}

	async function sendDel() {
		await ensureConnection();
		if (!_guard() || !window.kbve) return;
		const envelope = window.kbve.data.redis.wrapRedisDel(key);
		await window.kbve.ws.send(envelope);
		response = `[DEL] Deleted "${key}"`;
	}
</script>

<div class="min-h-screen bg-gray-900 text-white p-8 flex flex-col items-center">
	<div
		class="bg-purple-800 text-white rounded-xl shadow-lg p-6 w-full max-w-lg space-y-4">
		<h2 class="text-2xl font-bold mb-4">Redis WebSocket Test</h2>

		<input
			class="w-full rounded-md p-2 bg-gray-100 text-black focus:outline-purple-500"
			placeholder="Key"
			bind:value={key} />

		<input
			class="w-full rounded-md p-2 bg-gray-100 text-black focus:outline-purple-500"
			placeholder="Value"
			bind:value />

		<div class="flex gap-2">
			<button
				onclick={sendSet}
				class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded-md">
				Set
			</button>
			<button
				onclick={sendGet}
				class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded-md">
				Get
			</button>
			<button
				onclick={sendDel}
				class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded-md">
				Del
			</button>
		</div>

		<pre
			class="bg-gray-800 text-purple-300 p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-words">
{response}
		</pre>
	</div>
</div>
