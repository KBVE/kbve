<script lang="ts">
	import { proxy } from 'comlink';
	import { onMount, onDestroy } from 'svelte';

	// States
	let key = $state('');
	let value = $state('');
	let response = $state('');
	let userCommands = $state<string[]>([]);
	let messages = $state<{ key: string; message: any }[]>([]);
	let inspected = $state<Record<string, boolean>>({});

	// Redis States
	let stream = $state('');
	let id = $state('*'); // Optional, usually "*" for XADD
	let fields = $state<Record<string, string>>({}); // Example: { username: "h0lybyte", message: "hello" }

	let streams = $state<{ stream: string; id: string }[]>([]); // Used for XREAD
	let count = $state<number | undefined>(undefined);
	let block = $state<number | undefined>(undefined);

	// Table Helpers
	function toggleInspect(key: string) {
		inspected = { ...inspected, [key]: !inspected[key] };
	}

	function parseTimestamp(key: string): string {
		const [, ts] = key.split(':');
		const date = new Date(Number(ts));
		if (isNaN(date.getTime())) return 'Invalid Date';
		return date.toLocaleString();
	}

	async function loadStoredMessages() {
		const api = window.kbve?.api;
		if (!api) return;
		const raw = await api.getAllWsMessages();
		messages = raw.filter((m) => m?.key && typeof m.message === 'object').slice(0, 10);
	}

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

		while (!api) {
			api = window.kbve?.api;
			if (!api) {
				console.warn(
					'[Svelte] [WebsocketClient] Waiting for window.kbve.api...',
				);
				await new Promise((res) => setTimeout(res, 250));
			}
		}

		let ws;
		while (!ws) {
			try {
				await kbve().ws.connect(getWsUrl());
				ws = kbve().ws;
			} catch {
				console.warn(
					'[Svelte] [WebsocketClient] Retrying websocket connection...',
				);
				await new Promise((res) => setTimeout(res, 250));
			}
		}

		ws.onMessage(
			proxy((msg: any) => {
				try {
					userCommands = [...userCommands, '↩️ Redis responded'];
					loadStoredMessages();
				} catch (err) {
					console.warn('[WS] Message listener error:', err);
				}
			}),
		);

		loadStoredMessages();

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
		xadd: {
			label: 'XADD',
			build: () => kbve().data.redis.wrapRedisXAdd(stream, fields, id),
			log: () => `[XADD] ${stream} ${id ?? '*'} ${JSON.stringify(fields)}`,
		},
		xread: {
			label: 'XREAD',
			build: () => kbve().data.redis.wrapRedisXRead(streams, count, block),
			log: () => `[XREAD] ${streams.map(s => s.stream).join(', ')} count=${count ?? '-'} block=${block ?? '-'}`,
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

<div class="min-h-screen text-white flex flex-col items-center">
	<div
		class="bg-purple-800/[.15] text-white rounded-xl shadow-lg p-6 w-full space-y-4">
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
			class="bg-gray-800 text-purple-300 p-4 rounded-md overflow-x-auto whitespace-pre-wrap break-words text-sm font-mono">
        	{#each userCommands as cmd}
				→ {cmd}
			{/each}
        </pre>

		<!-- Message History -->

		<div class="mt-6 w-full">
			<h3 class="text-lg font-semibold mb-2">📜 Message History</h3>

			<table
				class="w-full text-sm text-left text-purple-200 table-auto border-separate border-spacing-y-2">
				<caption class="caption-top">
					Lastest Entries via DB Worker.
				</caption>
				<thead class="text-xs uppercase text-purple-400">
					<tr class="bg-purple-700 text-white">
						<th class="p-2 rounded-l">Time</th>
						<th class="p-2 hidden md:block">Key</th>
						<th class="p-2">Summary</th>
						<th class="p-2 rounded-r text-right">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each messages as m (m.key)}
						<tr
							class="bg-gray-800 rounded shadow-sm hover:bg-gray-700 transition-all duration-200">
							<td class="p-2 text-xs font-mono">
								{parseTimestamp(m.key)}
							</td>
							<td class="p-2 text-xs font-mono text-purple-400 hidden md:block">
								{m.key}
							</td>
							<td
								class="p-2 truncate max-w-[100px] md:max-w-[300px] text-purple-300">
								{JSON.stringify(m.message).slice(
									0,
									120,
								)}{m.message &&
								JSON.stringify(m.message).length > 120
									? '…'
									: ''}
							</td>
							<td class="p-2 text-right">
								<button
									class="text-xs px-2 py-1 rounded bg-purple-400 hover:bg-purple-500"
									onclick={() => toggleInspect(m.key)}>
									{inspected[m.key] ? 'Hide' : 'Inspect'}
								</button>
							</td>
						</tr>
						{#if inspected[m.key]}
							<tr>
								<td
									colspan="4"
									class="p-2 bg-gray-900 rounded-b">
									<pre
										class="text-xs text-purple-300 whitespace-pre-wrap break-words">
{JSON.stringify(m.message, null, 2)}
						</pre>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Stream Chat Example -->

		<div class="mt-6 w-full">

		</div>

	</div>
</div>
