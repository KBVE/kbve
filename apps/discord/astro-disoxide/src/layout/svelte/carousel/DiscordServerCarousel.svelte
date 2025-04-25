<script lang="ts">
	import { onMount } from 'svelte';
	import { panelManager } from 'src/layout/scripts/nanostores';
	import type {
		DiscordServer,
		DiscordTag,
		Profile,
	} from 'src/content/config';

	// import { wrap, proxy } from 'comlink';
	let isReady = $state(false);

	function renderHtmlForServer(server: DiscordServer): string {
		return `
			<div class="flex flex-col gap-2 p-2">
				<img src="${server.logo}" alt="${server.name}" class="w-12 h-12 rounded-full" />
				<h3 class="text-lg font-bold">${server.name}</h3>
				<p class="text-sm opacity-70">${server.summary}</p>
				<a href="${server.invite}" class="text-purple-400 underline text-xs">Join Join Join</a>
			</div>
		`.trim();
	}

	async function seedMockServers(count = 20) {
		const now = Date.now();
		const servers: DiscordServer[] = [];

		for (let i = 1; i <= count; i++) {
			servers.push({
				server_id: `server-${i}`,
				owner_id: `owner-${i}`,
				lang: i % 3,
				status: i % 2 === 0 ? 1 : 0,
				invite: `https://discord.gg/fakeinvite${i}`,
				name: `Server ${i}`,
				summary: `This is the summary for server ${i}.`,
				description: `Server ${i} is a vibrant community focused on discussion and events.`,
				website: i % 2 === 0 ? `https://server${i}.com` : null,
				logo: `https://api.dicebear.com/7.x/bottts/svg?seed=server${i}`,
				banner: null,
				video: null,
				categories: (i % 5) + 1,
				updated_at: new Date(now - i * 3600_000).toISOString(),
			});
		}

		const api = window.kbve?.api;
		if (!api) return;

		await api.putServers(servers);

		const htmlCards = servers.map((s) => ({
			key: s.server_id,
			value: renderHtmlForServer(s),
		}));
		await api.putHtmlCards(htmlCards);
		await api.markSeeded();

		console.log(`[seedMockServers] Seeded ${servers.length} servers ✅`);
	}

	let currentSlideIndex = 0;
	let renderedCards: Record<string, string> = {};
	let serverIds: string[] = [];

	let container: HTMLDivElement;

	async function fetchServerData() {
		let api;
		while (!api) {
			api = window.kbve?.api;
			if (!api) {
				console.warn('[Carousel] Waiting for window.kbve.api...');
				await new Promise((res) => setTimeout(res, 250));
			}
		}

		let seeded = false;
		while (!seeded) {
			try {
				seeded = await api.checkSeeded();
				if (!seeded) {
					console.info('[Carousel] Seeding mock servers...');
					await seedMockServers();
				}
			} catch (err) {
				console.warn('[Carousel] Waiting for DB seed...');
				await new Promise((res) => setTimeout(res, 1000));
			}
		}

		const servers = await api.getAllServers();
		const validServers = servers.filter(
			(s) => typeof s.server_id === 'string' && s.server_id.trim() !== '',
		);

		serverIds = validServers.map((s) => s.server_id);

		for (const s of validServers) {
			const html = await api.getHtmlCard(s.server_id);
			if (html) renderedCards[s.server_id] = html;
		}

		const skeleton = document.getElementById('astro-skeleton');
		if (skeleton) {
			skeleton.classList.add('opacity-0');
			setTimeout(() => skeleton.remove(), 600);
		}

		isReady = true;
	}

	onMount(() => {
		fetchServerData();
	});

	function goTo(index: number) {
		currentSlideIndex = index;
		container?.children?.[index]?.scrollIntoView({
			behavior: 'smooth',
			inline: 'start',
		});
	}

	function previous() {
		if (serverIds.length === 0) return;

		const newIndex =
			currentSlideIndex > 0
				? currentSlideIndex - 1
				: serverIds.length - 1;

		goTo(newIndex);
	}
	function next() {
		if (serverIds.length === 0) return;

		const newIndex =
			currentSlideIndex < serverIds.length - 1
				? currentSlideIndex + 1
				: 0;

		goTo(newIndex);
	}

	function openPanelFromSvelte(serverId: string) {
		const html = renderedCards[serverId];

		panelManager.get().openPanel('right', {
			name: `Server: ${serverId}`,
			description: 'Pre-rendered server from carousel',
			server_id: serverId,
			html,
		});
	}
</script>

{#if isReady}
	<div class="relative overflow-visible w-full">
		<div
			bind:this={container}
			class="flex gap-4 overflow-x-auto overflow-y-visible scroll-smooth snap-x snap-mandatory pb-4">
			{#each serverIds as serverId (serverId)}
				<div
					role="button"
					tabindex="0"
					aria-label="Open server panel"
					class="snap-start shrink-0 w-[85%] sm:w-[48%] lg:w-[32%] transition-transform duration-300 relative z-[10] min-h-[320px]"
					onclick={() => openPanelFromSvelte(serverId)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							openPanelFromSvelte(serverId);
						}
					}}>
					{#if renderedCards[serverId]}
						<!-- Pre-rendered HTML card -->
						<div class="card-tile">
							{@html renderedCards[serverId]}
						</div>
					{:else}
						<!-- Skeleton fallback -->
						<div
							class="card-tile animate-pulse bg-[#2b2740] rounded-lg shadow-md h-[320px]">
							<div
								class="h-12 w-12 bg-gray-700 rounded-full mb-2">
							</div>
							<div class="h-4 w-2/3 bg-gray-700 rounded mb-1">
							</div>
							<div class="h-3 w-1/2 bg-gray-700 rounded mb-2">
							</div>
							<div class="h-24 w-full bg-gray-800 rounded"></div>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Arrows -->
		<button
			type="button"
			class="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-purple-600/30 hover:bg-purple-600/50 text-white p-2 rounded-full"
			onclick={previous}
			aria-label="Previous">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="3"
				stroke="currentColor"
				class="w-5 h-5">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 19.5 8.25 12l7.5-7.5" />
			</svg>
		</button>

		<button
			type="button"
			class="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-purple-600/30 hover:bg-purple-600/50 text-white p-2 rounded-full"
			onclick={next}
			aria-label="Next">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="3"
				stroke="currentColor"
				class="w-5 h-5">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8.25 4.5l7.5 7.5-7.5 7.5" />
			</svg>
		</button>
	</div>
{/if}
