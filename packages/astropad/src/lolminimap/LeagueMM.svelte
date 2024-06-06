<script>
    import { writable, derived } from 'svelte/store';
    import { onMount } from 'svelte';
  
    // Champion data and state
    let champions = [
      { name: 'TOP', color: 'bg-cyan-500', waypoints: [{ x: 20, y: 260 }] },
      { name: 'JGL', color: 'bg-orange-500', waypoints: [{ x: 40, y: 260 }] },
      { name: 'MID', color: 'bg-red-500', waypoints: [{ x: 80, y: 250 }] },
      { name: 'SUP', color: 'bg-yellow-500', waypoints: [{ x: 60, y: 245 }] },
      { name: 'ADC', color: 'bg-cyan-700', waypoints: [{ x: 40, y: 240 }] }
    ];
    let selectedChampionIndex = writable(null);
  
    let x = '';
    let y = '';
    let imageWidth = 0;
    let imageHeight = 0;
  
    let imgElement;
  
    function addWaypoint() {
      selectedChampionIndex.update(index => {
        if (index !== null) {
          champions[index] = {
            ...champions[index],
            waypoints: [...champions[index].waypoints, { x: parseInt(x, 10), y: parseInt(y, 10) }]
          };
        }
        return index;
      });
    }
  
    function handleMapClick(event) {
      const rect = imgElement.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      x = Math.round((clickX / rect.width) * imageWidth);
      y = Math.round((clickY / rect.height) * imageHeight);
    }
  
    onMount(() => {
      imgElement.onload = () => {
        imageWidth = imgElement.naturalWidth;
        imageHeight = imgElement.naturalHeight;
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
          <input type="number" bind:value={x} class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </label>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Y Coordinate:
          <input type="number" bind:value={y} class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </label>
        <button on:click={addWaypoint} class="mt-3 px-4 py-2 bg-blue-500 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
          Add Waypoint
        </button>
      </div>
  
      <div class="image-container relative mb-4" on:click={handleMapClick}>
        <img bind:this={imgElement} alt="Your Minimap for League" src="/assets/img/lol/rift_s14.webp" class="max-w-full rounded-md shadow-md" />
  
        {#each $activeWaypoints as waypoint, index}
          <div
            class={`waypoint ${champions[$selectedChampionIndex].color}`}
            style="left: ${waypoint.x}px; top: ${waypoint.y}px;"
          >
            {champions[$selectedChampionIndex].name[0]}
          </div>
        {/each}
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
  