<script>
    import { writable } from 'svelte/store';
  
    let x = '';
    let y = '';
    const coordinates = writable({ x: null, y: null });
  
    function placeMarker() {
      coordinates.set({ x: parseInt(x, 10), y: parseInt(y, 10) });
    }
  </script>
  
  <style>
    .image-container {
      position: relative;
      display: inline-block;
    }
    .marker {
      position: absolute;
      width: 10px;
      height: 10px;
      background-color: red;
      border-radius: 50%;
    }
  </style>
  
  <div class="min-h-screen bg-gray-100 flex items-center justify-center">
    <div class="max-w-lg mx-auto p-4 text-center">
      <h1 class="text-4xl font-bold text-gray-800 mb-8">Image Marker</h1>
      <div class="flex flex-col items-center mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          X Coordinate:
          <input type="number" bind:value={x} class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </label>
        <label class="block text-sm font-medium text-gray-700 mb-2">
          Y Coordinate:
          <input type="number" bind:value={y} class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
        </label>
        <button on:click={placeMarker} class="mt-3 px-4 py-2 bg-blue-500 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
          Place Marker
        </button>
      </div>
  
      <div class="image-container relative">
       
        <img alt="Your Minimap for League" src="/assets/img/lol/rift_s14.webp"  class="max-w-full rounded-md shadow-md" />
  
        {#if $coordinates.x !== null && $coordinates.y !== null}
          <div
            class="marker"
            style="left: {$coordinates.x}px; top: {$coordinates.y}px;"
          ></div>
        {/if}
      </div>
    </div>
  </div>
  