<script lang="ts">
	import { proxy } from 'comlink';
	import { onMount, onDestroy } from 'svelte';

	// States
	let key = $state('');
	let value = $state('');
	let response = $state('');
	let userCommands = $state<string[]>([]);


	// Debounce
	function debounce<T extends (...args: any[]) => void>(
		fn: T,
		delay = 300,
	): T {
		let timeout: ReturnType<typeof setTimeout> | null = null;
		return function (...args: Parameters<T>) {
			if (timeout) clearTimeout(timeout);
			timeout = setTimeout(() => fn(...args), delay);
		} as T;
	}

	// Ready State
	async function readyCheck() {

        // (init)

        let api;

        while(!api)
        {
            api = window.kbve?.api
            if (!api) {
				console.warn('[Svelte] [WebsocketClient] Waiting for window.kbve.api...');
				await new Promise((res) => setTimeout(res, 250));
			} 
        }

        let con;
        while(!con)
        {
            con = kbve().ws.connect(getWsUrl());
            if (!con) {
                console.warn('[Svelte] [WebsocketClient] Waiting for websocket connection...');
				await new Promise((res) => setTimeout(res, 250));
            }
        }

	    const skeleton = document.getElementById('astro-skeleton');
        if (skeleton) {
                    skeleton.classList.add('opacity-0');
                    setTimeout(() => skeleton.remove(), 600);
        }
	}

   

	// Reset State
	function reset() {
		try {
			const api = kbve();
			if (api.ws) {
				api.ws.close();
			}
		} catch (err) {
			console.warn('[KBVE] Reset failed:', err);
		}

		userCommands = [];
		response = '... Closing connection ...';
	}

	const kbve = (() => {
		return () => {
			if (
				typeof window === 'undefined' ||
				!window.kbve ||
				!window.kbve.ws ||
				!window.kbve.data?.redis
			) {
				throw new Error('[KBVE] API not available');
			}
			return window.kbve;
		};
	})();

	function getWsUrl() {
		return ['localhost', '127.0.0.1'].includes(location.hostname)
			? 'ws://localhost:3000/ws'
			: `wss://${location.host}/ws`;
	}

	const redisCommandMap = {
		set: {
			label: 'SET',
			build: () => kbve().data.redis.wrapRedisSet(key, value),
			log: () => `[SET] ${key} = ${value}`,
		},
		get: {
			label: 'GET',
			build: () => kbve().data.redis.wrapRedisGet(key),
			log: () => `[GET] ${key}`,
		},
		del: {
			label: 'DEL',
			build: () => kbve().data.redis.wrapRedisDel(key),
			log: () => `[DEL] ${key}`,
		},
	} as const;

	type RedisCommandType = keyof typeof redisCommandMap;

	async function redis(command: RedisCommandType) {
		const cmd = redisCommandMap[command];
		if (!cmd) {
			console.warn(`[Redis] Unknown command: ${command}`);
			return;
		}

		const envelope = cmd.build();
		await kbve().ws.send(envelope);
		userCommands = [...userCommands, cmd.log()];
	}

	onMount(() => {
        readyCheck();
	});

	onDestroy(() => {
		reset();
	});
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
				onclick={() => redis('set')}
				class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded-md">
				Set
			</button>
			<button
				onclick={() => redis('get')}
				class="bg-purple-500 hover:bg-purple-600 px-4 py-2 rounded-md">
				Get
			</button>
			<button
				onclick={() => redis('del')}
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
