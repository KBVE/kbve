<script>
  import { writable, derived } from 'svelte/store';
  import { onMount } from 'svelte';

  // Champion data and state
  const champions = [
    { name: 'TOP', color: 'bg-cyan-500', waypoints: [{ x: 267, y: 1083 }] },
    { name: 'JGL', color: 'bg-orange-500', waypoints: [{ x: 272, y: 1146 }] },
    { name: 'MID', color: 'bg-red-500', waypoints: [{ x: 80, y: 250 }] },
    { name: 'SUP', color: 'bg-yellow-500', waypoints: [{ x: 60, y: 245 }] },
    { name: 'ADC', color: 'bg-cyan-700', waypoints: [{ x: 40, y: 240 }] }
  ];
  
  const selectedChampionIndex = writable(null);
  const x = writable('');
  const y = writable('');
  const imageWidth = writable(0);
  const imageHeight = writable(0);
  const mounted = writable(false);

  let imgElement;

  function addWaypoint() {
    selectedChampionIndex.update(index => {
      if (index !== null) {
        const champion = champions[index];
        champion.waypoints.push({ x: parseInt($x, 10), y: parseInt($y, 10) });
      }
      return index;
    });
  }

  function handleMapClick(event) {
    const rect = imgElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    x.set(Math.round((clickX / rect.width) * $imageWidth));
    y.set(Math.round((clickY / rect.height) * $imageHeight));
    console.log(`Click coordinates: ${$x}, ${$y}`);
  }

  onMount(() => {
    imgElement.onload = () => {
      imageWidth.set(imgElement.naturalWidth);
      imageHeight.set(imgElement.naturalHeight);
      mounted.set(true);
      console.log(`Image loaded with dimensions: ${$imageWidth}x${$imageHeight}`);
    };
  });

  const selectedChampion = derived(selectedChampionIndex, $selectedChampionIndex => {
    return $selectedChampionIndex !== null ? champions[$selectedChampionIndex].name : 'None';
  });

  const activeWaypoints = derived(selectedChampionIndex, $selectedChampionIndex => {
    return $selectedChampionIndex !== null ? champions[$selectedChampionIndex].waypoints : [];
  });
</script>

<style>
  .image-container {
    position: relative;
    display: inline-block;
  }
  .waypoint {
    position: absolute;
    width: 20px;
    height: 20px;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    border-radius: 50%;
  }
</style>

<div class="min-h-screen bg-gray-100 flex flex-col items-center justify-center">
  <div class="max-w-lg mx-auto p-4 text-center">
    <h1 class="text-4xl font-bold text-gray-800 mb-8">League of Legends Minimap Tool</h1>

    <div class="flex flex-wrap justify-center mb-4">
      {#each champions as champion, index}
        <button on:click={() => selectedChampionIndex.set(index)} class="m-2 p-2 bg-gray-200 rounded hover:bg-gray-300 focus:outline-none">
          <div class={`w-10 h-10 ${champion.color} text-white flex items-center justify-center rounded-md`}>
            {champion.name}
          </div>
        </button>
      {/each}
    </div>

    <div class="flex flex-col items-center mb-4">
      <p class="text-xl font-semibold mb-2">Selected Champion: {$selectedChampion}</p>
      <label class="block text-sm font-medium text-gray-700 mb-2">
        X Coordinate:
        <input type="number" bind:value={$x} class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
      </label>
      <label class="block text-sm font-medium text-gray-700 mb-2">
        Y Coordinate:
        <input type="number" bind:value={$y} class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
      </label>
      <button on:click={addWaypoint} class="mt-3 px-4 py-2 bg-blue-500 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
        Add Waypoint
      </button>
    </div>

    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <div class="image-container relative mb-4" on:click={handleMapClick}>
      <img bind:this={imgElement} alt="Your Minimap for League" src="/assets/img/lol/rift_s14.webp" class="max-w-full rounded-md shadow-md" />

      {#if $mounted}
        {#each $activeWaypoints as waypoint, index}
          <div
            class={`waypoint ${champions[$selectedChampionIndex].color}`}
            style="left: {(waypoint.x / $imageWidth) * 100}%; top: {(waypoint.y / $imageHeight) * 100}%;"
          >
            {champions[$selectedChampionIndex].name[0]}
          </div>
        {/each}
      {/if}
    </div>

    {#if $selectedChampionIndex !== null}
      <div class="w-full text-left">
        <h2 class="text-xl font-semibold mb-2">Waypoints for {$selectedChampion}</h2>
        <ul class="list-disc pl-5">
          {#each $activeWaypoints as waypoint, index}
            <li key={index}>X: {Math.round(waypoint.x)}, Y: {Math.round(waypoint.y)}</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>
