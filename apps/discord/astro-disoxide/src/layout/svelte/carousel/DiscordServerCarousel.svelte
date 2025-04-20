<script lang="ts">
	import { onMount } from 'svelte';
	import { dispatchCommand } from 'src/layout/scripts/client';
	import type { DiscordServer } from 'src/env';

	let currentSlideIndex = 0;
	let renderedCards: Record<string, string> = {};
	let serverIds: string[] = [];

	let container: HTMLDivElement;

	async function fetchServerData() {
		let seeded = false;

		while (!seeded) {
			try {
				console.log(
					'[Carousel] Fetching meta:db_seeded with correct shape...',
				);

				seeded = await dispatchCommand('db_get', {
					store: 'meta',
					key: 'db_seeded',
				});
				console.log('[Carousel] DB seeded:', seeded);
			} catch (e) {
				console.warn('[Carousel] Waiting for DB seed to complete...');
			}

			if (!seeded) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		}

		const dbServers: DiscordServer[] = await dispatchCommand('db_list', {
			store: 'jsonservers',
		});

		const validServers = dbServers.filter(
			(s) => typeof s.server_id === 'string' && s.server_id.trim() !== '',
		);
		serverIds = validServers.map((s) => s.server_id);

		for (const id of serverIds) {
			const html: string | null = await dispatchCommand('db_get', {
				store: 'htmlservers',
				key: id,
			});
			if (html) {
				renderedCards[id] = html;
			}
		}

		const skeleton = document.getElementById('astro-skeleton');
		if (skeleton) {
			skeleton.classList.add('opacity-0');
			setTimeout(() => skeleton.remove(), 600);
		}
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
	try {
		const panelStore = (window as any).Alpine?.store('panelManager');
		console.log('[Svelte] Alpine panelManager:', panelStore);

		if (!panelStore?.openPanel) {
			console.warn('[Svelte] openPanel not found on panelManager');
			return;
		}

		const html = renderedCards[serverId];
		panelStore.openPanel('right', {
			server_id: serverId,
			html,
		});
	} catch (err) {
		console.warn('[Svelte] Failed to open right panel with server:', err);
	}
}
</script>

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
				on:click={() => openPanelFromSvelte(serverId)}
				on:keydown={(e) => {
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
						<div class="h-12 w-12 bg-gray-700 rounded-full mb-2">
						</div>
						<div class="h-4 w-2/3 bg-gray-700 rounded mb-1"></div>
						<div class="h-3 w-1/2 bg-gray-700 rounded mb-2"></div>
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
		on:click={previous}
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
		on:click={next}
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
