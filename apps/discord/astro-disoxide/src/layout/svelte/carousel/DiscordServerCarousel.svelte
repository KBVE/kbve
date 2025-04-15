<script lang="ts" context="module">
	declare global {
	  interface Window {
		supabase?: typeof supabase;
	  }
	}
	declare var supabase: any;
  </script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { panelStore } from 'src/layout/scripts/nanostores';
	import type { DiscordServer } from 'src/env';

	export let initial: DiscordServer[] = [];

	let slides: DiscordServer[] = [];
	let currentSlideIndex = 0;
	let container: HTMLDivElement;

	const goTo = (index: number) => {
		currentSlideIndex = index;
		container?.children?.[index]?.scrollIntoView({ behavior: 'smooth', inline: 'start' });
	};

	const previous = () => {
		if (currentSlideIndex > 0) goTo(currentSlideIndex - 1);
	};

	const next = () => {
		if (currentSlideIndex < slides.length - 1) goTo(currentSlideIndex + 1);
	};

	onMount(() => {
		slides = initial;
	});

	onDestroy(() => {
		slides = [];
	});
</script>

<div class="relative overflow-visible w-full">
	<!-- Scrollable Snap Container -->
	<div
		bind:this={container}
		class="flex gap-4 overflow-x-auto overflow-y-visible scroll-smooth snap-x snap-mandatory pb-4"
	>
		{#each slides as server, index (server.server_id)}
			<div
				class="snap-start shrink-0 w-[85%] sm:w-[48%] lg:w-[32%] transition-transform duration-300 relative z-[10] min-h-[320px]"
				on:click={() => panelStore.open(`server:${server.server_id}`, server)}
			>
				<div class="card-tile p-4 bg-[#2b2740] rounded-lg shadow-md hover:scale-[1.01] transition-transform duration-300 cursor-pointer">
					<div class="flex items-center space-x-3">
						<img src={server.logo || '/default-logo.png'} alt={`${server.name} logo`} class="w-12 h-12 rounded-full border border-purple-400 object-cover" />
						<div>
							<h3 class="text-base font-semibold text-purple-200">{server.name}</h3>
							<p class="text-xs text-gray-400">Summary: {server.summary}</p>
						</div>
					</div>
					<div class="text-sm text-gray-300 space-y-1 pt-2">
						{#if server.description}<p class="line-clamp-1 text-sm">{server.description}</p>{/if}
						<p><span class="text-purple-400">Invite:</span> {server.invite}</p>
						{#if server.website}
							<p>
								<span class="text-purple-400">Website:</span>
								<a href={server.website} target="_blank" rel="noopener noreferrer" class="underline hover:text-purple-300">{server.website}</a>
							</p>
						{/if}
						<p>
							<span class="text-purple-400">Updated:</span>
							<time datetime={server.updated_at}>
								{new Date(server.updated_at).toLocaleDateString()}
							</time>
						</p>
					</div>
					<div class="flex flex-wrap gap-1 pt-2">
						<span class="text-xs bg-purple-600/20 text-purple-300 px-2 py-1 rounded">
							Category #{server.categories}
						</span>
						<span class="text-xs bg-purple-600/20 text-purple-300 px-2 py-1 rounded">
							Status: {server.status}
						</span>
					</div>
				</div>
			</div>
		{/each}
	</div>

	<!-- Arrows -->
	<button
		type="button"
		class="absolute left-2 top-1/2 z-10 -translate-y-1/2 bg-purple-600/30 hover:bg-purple-600/50 text-white p-2 rounded-full"
		on:click={previous}
		aria-label="Previous"
	>
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
		</svg>
	</button>

	<button
		type="button"
		class="absolute right-2 top-1/2 z-10 -translate-y-1/2 bg-purple-600/30 hover:bg-purple-600/50 text-white p-2 rounded-full"
		on:click={next}
		aria-label="Next"
	>
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
		</svg>
	</button>

	<!-- Dots -->
	<div class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
		{#each slides as _, index}
			<button
				class="w-2 h-2 rounded-full"
				class:bg-purple-400={currentSlideIndex === index}
				class:bg-purple-500/30={currentSlideIndex !== index}
				on:click={() => goTo(index)}
			></button>
		{/each}
	</div>
</div>
