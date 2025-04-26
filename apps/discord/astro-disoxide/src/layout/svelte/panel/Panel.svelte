<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { PanelId } from 'src/env';
	import { cubicInOut } from 'svelte/easing';

	export let panelId: PanelId;

	let panel: any = null;
	let scrollY = 0;


	onMount(() => {
		initializePanel();
	});


// 	function updateBodyScrollLock() {
// 	const panels = (window.kbve?.uiux?.state.get().panelManager ?? {}) as Record<string, { open: boolean }>;
// 	const isAnyPanelOpen = Object.values(panels).some((p) => p?.open);

// 	if (isAnyPanelOpen) {
// 		scrollY = window.scrollY;
// 		document.body.style.position = 'fixed';
// 		document.body.style.top = `-${scrollY}px`;
// 		document.body.style.width = '100%'; 
// 		document.body.classList.add('overflow-hidden'); 
// 	} else {
// 		document.body.style.position = '';
// 		document.body.style.top = '';
// 		document.body.style.width = '';
// 		document.body.classList.remove('overflow-hidden'); 
// 		window.scrollTo(0, scrollY);
// 	}
// }

	async function initializePanel() {
		let tries = 0;
		let delay = 50;

		while (
			(!window.kbve?.uiux || !window.kbve?.uiux?.state) &&
			tries < 15
		) {
			await new Promise((r) => setTimeout(r, delay));
			tries++;
			delay += 50;
		}

		const unsub = window.kbve?.uiux?.state.subscribe((value) => {
			panel = value.panelManager[panelId];
			//updateBodyScrollLock();
		});

		if (panel?.payload?.needsCanvas) {
			const canvasEl = document.getElementById(
				`panel-canvas-${panelId}`,
			) as HTMLCanvasElement;
			if (canvasEl) {
				const mode = panel.payload.canvasOptions?.mode ?? 'animated';
				await window.kbve?.uiux?.dispatchCanvasRequest(
					panelId,
					canvasEl,
					mode,
				);
			}
		}

		return () => unsub?.();
	}
</script>

{#if panel?.open}
	<div
		class={`fixed z-[9999] bg-gray-900 text-white shadow-xl transform
	${
		panelId === 'top'
			? 'top-0 left-0 right-0 h-1/2'
			: panelId === 'bottom'
				? 'bottom-0 left-0 right-0 h-1/2'
				: panelId === 'left'
					? 'top-0 bottom-0 left-0 w-full sm:w-1/2'
					: 'top-0 bottom-0 right-0 w-full sm:w-1/2'
	}
`}
		transition:fly={{
			x: panelId === 'right' ? 500 : panelId === 'left' ? -500 : 0,
			y: panelId === 'bottom' ? 500 : panelId === 'top' ? -500 : 0,
			duration: 400,
			easing: cubicInOut,
		}}
		style="will-change: transform">
		<div
			class="p-4 flex justify-between items-center border-b border-gray-700">
			<h2 class="text-lg font-semibold capitalize">
				{panel?.payload?.name ?? 'Details'}
			</h2>
			<button
				on:click={() => window.kbve?.uiux?.closePanel(panelId)}
				class="text-purple-400 hover:text-white text-xl font-bold">
				✕
			</button>
		</div>

		<div class="p-4 overflow-y-auto space-y-4 text-sm">
			{#if panel?.payload?.rawHtml}
				<div>{@html panel.payload.rawHtml}</div>
			{/if}

			{#if panel?.payload?.needsCanvas}
				<canvas
					id="panel-canvas-{panelId}"
					width={panel?.payload?.canvasOptions?.width ?? 300}
					height={panel?.payload?.canvasOptions?.height ?? 150}>
				</canvas>
			{/if}

			{#if $$slots.default}
				<slot />
			{:else}
				<p>{panel?.payload?.description}</p>
			{/if}
		</div>
	</div>
{/if}
