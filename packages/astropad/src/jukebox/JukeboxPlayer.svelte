<script lang="ts" context="module">
	declare global {
		interface Window {
			videojs?: typeof videojs;
		}
	}
	declare var videojs: any;
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	import {
		kbve$,
		musicData$,
		updateJukeBox$$$,
		tagSetting$,
	} from '@kbve/khashvault';

	// Variables
	let player: any;
	let scriptsLoaded = false;
	let mounted = false;
	let currentVideoId = '';

	let playTracks = true; // Toggle for playing tracks
	let playSets = false; // Toggle for playing sets

	onMount(() => {
		mounted = true;
		console.log('Mounted');
		loadVideoScripts().then(() => {
			if (mounted && scriptsLoaded) {
				initializeJukeBox();
			}
		});
	});

	onDestroy(() => {
		mounted = false;
		if (player) {
			player.dispose();
		}
	});

	async function loadVideoScripts() {
		try {
			await new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'https://unpkg.com/video.js/dist/video.min.js';
				script.onload = resolve;
				script.onerror = () =>
					reject(new Error('Failed to load Video.js'));
				document.head.appendChild(script);
			});

			await new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.src =
					'https://unpkg.com/videojs-youtube/dist/Youtube.min.js';
				script.onload = resolve;
				script.onerror = () =>
					reject(new Error('Failed to load YouTube plugin'));
				document.head.appendChild(script);
			});

			scriptsLoaded = true; // Update state to reflect that scripts are loaded
		} catch (error) {
			console.error('Error loading scripts:', error);
		}
	}

	async function fetchMusicData() {
		updateJukeBox$$$
			.then(() => {
				console.log('Music data has been successfully updated.');
			})
			.catch((error: any) => {
				console.error('Error updating music data:', error);
			});
	}

	function initializeTagsFromMusicData() {
    // Define newTags with an index signature
    const newTags: Record<string, boolean> = {};  // This tells TypeScript that newTags can have any number of properties where keys are strings and values are boolean.

    $musicData$.items.forEach((item) => {
        item.tags.forEach((tag) => {
            if (tag !== 'music') {
                newTags[tag] = true; // Initialize as true, skip "music"
            }
        });
    });

    tagSetting$.set(newTags);
}


	async function initializeJukeBox() {
		// First check if the music data needs to be fetched
		if ($musicData$.items.length === 0) {
			try {
				await fetchMusicData();  // Ensure music data is loaded
				console.log("Music Data Loaded:", $musicData$.items);
			} catch (error) {
				console.error('Failed to fetch music data:', error);
				return; // Stop further execution if data cannot be fetched
			}
		}

		// Now, check if tags need to be initialized
		if (Object.keys($tagSetting$).length === 0) {
			console.log("Initializing tags from music data...");
			initializeTagsFromMusicData();  // Initialize tags if tagSetting$ is empty
		} else {
			console.log("Tags already initialized:", $tagSetting$);
		}

		// Finally, initialize the player regardless
		initializePlayer();
	}


	function initializePlayer() {
		if (typeof videojs !== 'undefined' && videojs.getTech('youtube')) {
			const allVideos = getActiveVideos();
			if (allVideos.length === 0) return; // Prevent initialization if no videos are available

			const randomIndex = Math.floor(Math.random() * allVideos.length); // Select a random index
			const initialVideoId = allVideos[randomIndex]; // Use the random index to fetch an ID

			player = videojs('video-js', {
				techOrder: ['youtube'],
				sources: [
					{
						type: 'video/youtube',
						src: `https://www.youtube.com/watch?v=${initialVideoId}`,
					},
				],
				youtube: { iv_load_policy: 3 },
				controls: true,
				autoplay: true,
				preload: 'auto',
			});

			player.on('ended', loadNextVideo); // Load next video when one ends
			// Set the current video ID
			currentVideoId = initialVideoId;
		} else {
			setTimeout(initializePlayer, 100); // Retry after 100ms
		}
	}

	function getActiveVideos() {
		let activeVideos: any[] = [];

		// Iterate over each music item
		$musicData$.items.forEach((item) => {
			// Check if any of the item's tags are active
			const isActive = item.tags.some(
				(tag) => $tagSetting$[tag] === true,
			);

			// If any tag is active, check user preferences for tracks and sets
			if (isActive) {
				if (playTracks) {
					activeVideos = activeVideos.concat(item.ytTracks);
				}
				if (playSets) {
					activeVideos = activeVideos.concat(item.ytSets);
				}
			}
		});

		return activeVideos;
	}

	function loadNextVideo() {
		const allVideos = getActiveVideos();
		if (allVideos.length === 0) return; // Prevent loading if no videos are available

		const nextVideoId =
			allVideos[Math.floor(Math.random() * allVideos.length)];
		player.src({
			type: 'video/youtube',
			src: `https://www.youtube.com/watch?v=${nextVideoId}`,
		});
		player.play();

		currentVideoId = nextVideoId;

	}

	function toggleTag(tag: string | number) {
        const updatedTags = {
            ...$tagSetting$,
            [tag]: !$tagSetting$[tag]
        };
        tagSetting$.set(updatedTags);
    }

	async function syncData() {
		// Clear existing data
		musicData$.set({ items: [] });  // Assuming $musicData$ is a writable store
		tagSetting$.set({});  // Assuming $tagSetting$ is a writable store or atom

    // Fetch and reinitialize data
		try {
			await fetchMusicData();  // Fetches and presumably updates $musicData$
			initializeTagsFromMusicData();  // Reinitialize tags based on the new music data
			initializePlayer();  // Reinitialize the player if necessary
			console.log('Data and tags have been synchronized.');
			window.location.reload();

		} catch (error) {
			console.error('Error during synchronization:', error);
		}
	}

</script>

<svelte:head>
	<link
		href="https://unpkg.com/video.js/dist/video-js.min.css"
		rel="stylesheet" />
</svelte:head>


<button on:click={syncData} class="px-4 py-2 bg-blue-500 border text-white rounded hover:scale-110 ease-in-out duration-500">
    Sync
</button>

<div class="space-x-2">
    {#each Object.keys($tagSetting$) as tag}
        <button
            class="px-3 py-1 text-sm font-medium border rounded-md hover:scale-110 ease-in-out duration-500"
            class:opacity-100={$tagSetting$[tag]}
            class:opacity-50={!$tagSetting$[tag]}
            on:click={() => toggleTag(tag)}>
            {tag}
        </button>
    {/each}
</div>

<div class="space-x-2 my-4">
	<button
		class="px-3 py-1 text-sm font-medium border rounded-md hover:scale-110 ease-in-out duration-500 {playTracks
			? 'opacity-100'
			: 'opacity-50'}"
		on:click={() => (playTracks = !playTracks)}>
		Play Tracks
	</button>
	<button
		class="px-3 py-1 text-sm font-medium border rounded-md hover:scale-110 ease-in-out duration-500 {playSets
			? 'opacity-100'
			: 'opacity-50'}"
		on:click={() => (playSets = !playSets)}>
		Play Sets
	</button>
</div>

<div class="mt-4">
    <strong>Currently Playing Video ID:</strong> {currentVideoId}
</div>

<!-- svelte-ignore a11y-media-has-caption -->
<video
	id="video-js"
	class="video-js vjs-default-skin w-full aspect-video"
	controls
	preload="auto"
	width="640"
	height="264"
	>
	<p class="vjs-no-js">
		To view this video please enable JavaScript, and consider upgrading to a
		web browser that
		<a href="https://videojs.com/html5-video-support/" target="_blank">
			supports HTML5 video
		</a>
	</p>
</video>
