<script lang="ts">
	import { onMount } from "svelte";

	onMount(() => {
		(async () => {
			console.log("onMount async is working!");
		})();
	});
</script>

<p>This component will now compile and run </p>

	