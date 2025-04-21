<script>
	let { panelId, open, payload, closePanel, children } = $props();

	let positionClass = $derived.by(() => {
		switch (panelId) {
			case 'top':
				return 'top-0 left-0';
			case 'bottom':
				return 'bottom-0 left-0';
			case 'left':
				return 'top-0 left-0';
			case 'right':
				return 'top-0 right-0';
			default:
				return '';
		}
	});
</script>

{#if open}
	<div
		class={`fixed z-[9999] w-full sm:max-w-lg h-full bg-gray-900 text-white shadow-xl transform ${positionClass}`}
		transition:fly={{
			x: panelId === 'right' ? 500 : panelId === 'left' ? -500 : 0,
			y: panelId === 'bottom' ? 500 : panelId === 'top' ? -500 : 0,
			duration: 300
		}}
		style="will-change: transform"
	>
		<!-- Panel Header -->
		<div class="p-4 flex justify-between items-center border-b border-gray-700">
			<h2 class="text-lg font-semibold capitalize">
				{payload?.name ?? 'Details'}
			</h2>
			<button
				on:click={() => closePanel(panelId)}
				class="text-purple-400 hover:text-white text-xl font-bold"
				aria-label="Close Panel"
			>
				✕
			</button>
		</div>

		<!-- Rendered Panel Content -->
		<div class="p-4 overflow-y-auto space-y-4 text-sm">
			{@render children()}
		</div>
	</div>
{/if}
