<script lang="ts">
	let {
		key,
		value,
		updateFieldValue,
		removeField
	}: {
		key: string;
		value: string;
		updateFieldValue: (key: string, value: string) => void;
		removeField: (key: string) => void;
	} = $props();

	$effect(() => {
		updateFieldValue(key, value);
	});
</script>

<div class="flex items-center gap-2">
	<span class="text-purple-300 font-mono">{key}</span>
	<input
		class="flex-1 rounded-md p-1 bg-gray-200 text-black"
		placeholder="Value"
		bind:value />
	<button
		onclick={() => removeField(key)}
		class="text-xs text-red-500">
		✕
	</button>
</div>