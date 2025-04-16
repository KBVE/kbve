<script lang="ts">
	import { onMount } from 'svelte';
	import { dispatchCommand } from 'src/layout/scripts/client';
	import { openPanel } from 'src/layout/scripts/nanostores';
	import type { DiscordServer } from 'src/env';

	
	let currentSlideIndex = 0;
	let renderedCards: Map<string, string> = new Map();
	let serverIds: string[] = []; // let serverIds: string[] = [];

	let container: HTMLDivElement;

	onMount(async () => {
		// Get server metadata (can also use nanostore $servers here)
		const dbServers: DiscordServer[] = await dispatchCommand('db_list', {});
		serverIds = dbServers.map((s) => s.server_id);

		// For each server, try to get its pre-rendered HTML
		for (const server of dbServers) {
			const html: string = await dispatchCommand('db_get', {
				key: `html:server:${server.server_id}`,
			});

			if (html) {
				renderedCards[server.server_id] = html;
			}
		}
	});

	function goTo(index: number) {
		container?.children?.[index]?.scrollIntoView({
			behavior: 'smooth',
			inline: 'start',
		});
	}

	function previous() {
		if (currentSlideIndex > 0) goTo(currentSlideIndex - 1);
	}

	function next() {
		if (currentSlideIndex < serverIds.length - 1)
			goTo(currentSlideIndex + 1);
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
				on:click={() => openPanel(`server:${serverId}`)}
				on:keydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						openPanel(`server:${serverId}`);
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
