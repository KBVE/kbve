<script lang="ts">
	import { panelManager } from 'src/layout/scripts/nanostores';
	import type { PanelId } from 'src/env';
	import { fly } from 'svelte/transition';

	export let panelId: PanelId;
</script>

{#if $panelManager.panels[panelId].open}
	<div class={`fixed z-[9999] w-full sm:max-w-lg h-full bg-gray-900 text-white shadow-xl transform
	  ${panelId === 'top' ? 'top-0 left-0' :
		panelId === 'bottom' ? 'bottom-0 left-0' :
		panelId === 'left' ? 'top-0 left-0' :
		'top-0 right-0'}`}
	  transition:fly={{
		x: panelId === 'right' ? 500 : panelId === 'left' ? -500 : 0,
		y: panelId === 'bottom' ? 500 : panelId === 'top' ? -500 : 0,
		duration: 300
	  }}
	  style="will-change: transform"
	>
		<div class="p-4 flex justify-between items-center border-b border-gray-700">
			<h2 class="text-lg font-semibold capitalize">
				{$panelManager.panels[panelId].payload?.name ?? 'Details'}
			</h2>
			<button
				on:click={() => $panelManager.closePanel(panelId)}
				class="text-purple-400 hover:text-white text-xl font-bold"
			>
				✕
			</button>
		</div>

		<div class="p-4 overflow-y-auto space-y-4 text-sm">
			<p>{$panelManager.panels[panelId].payload?.description}</p>
		</div>
	</div>
{/if}
