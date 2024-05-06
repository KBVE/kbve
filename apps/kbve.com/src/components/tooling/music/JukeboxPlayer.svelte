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

	import { kbve$ } from '@kbve/khashvault';

	let player: any;
	let ytTracks: string[] = [];
	let ytSets: string[] = [];
	let checkReadyInterval: number;
	let intervalCheck: number | undefined;
	let scriptsLoaded = false;
	let mounted = false;
	let playTracks = true; // Toggle for playing tracks
	let playSets = false; // Toggle for playing sets
	let allData: {
		ytSets: any;
		ytTracks: any;
		tags: any[];
	}[] = [];
	let tags = new Set<string>(); // Stores all available tags
	let selectedTags = new Set<string>(); // Stores currently selected tags
	let filteredTracks: any[] = []; // Stores tracks filtered by selected tags
	let filteredSets: any[] = []; // Stores sets filtered by selected tags

	async function fetchMusicData() {
		const response = await fetch('/api/music.json');
		const data = await response.json();
		allData = data.items;
		allData.forEach((item) => {
			item.tags.forEach((tag) => {
				if (tag !== 'music') tags.add(tag); // Ignore 'music' tag for the filter
			});
		});
		selectedTags = new Set(tags); // Initially select all tags
		filterTracks();
	}

	function filterTracks() {
		const filteredItems = allData.filter((item) =>
			item.tags.some((tag) => selectedTags.has(tag)),
		);

		filteredTracks = filteredItems.flatMap((item) => item.ytTracks);
		filteredSets = filteredItems.flatMap((item) => item.ytSets);
		initializePlayer(); // Function to initialize or update the player
	}

	function toggleTag(tag: string) {
		if (selectedTags.has(tag)) {
			selectedTags.delete(tag);
		} else {
			selectedTags.add(tag);
		}
		filterTracks();
	}

	function checkScriptsReady() {
		if (typeof videojs !== 'undefined' && videojs.getTech('youtube')) {
			clearInterval(checkReadyInterval);
			initializePlayer();
		}
	}

	function initializePlayer() {
		if (typeof videojs !== 'undefined') {
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
		} else {
			setTimeout(initializePlayer, 100); // Retry after 100ms
		}
	}

	function getActiveVideos() {
		return [
			...(playTracks ? filteredTracks : []),
			...(playSets ? filteredSets : []),
		];
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
	}

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

	$: if (mounted && scriptsLoaded) {
		// initializePlayer();
	}

	onMount(() => {
		mounted = true;
		loadVideoScripts().then(() => {
        scriptsLoaded = true; // Indicate that scripts are loaded
        fetchMusicData(); // Fetch the music data after scripts are loaded
    	});
	});

	onDestroy(() => {
		if (player) {
			player.dispose();
		}
	});
</script>

<svelte:head>
	<link
		href="https://unpkg.com/video.js/dist/video-js.min.css"
		rel="stylesheet" />
</svelte:head>

<div class="space-x-2">
	{#each Array.from(tags) as tag}
		<button
			class="px-3 py-1 text-sm font-medium rounded-md {selectedTags.has(
				tag,
			)
				? 'opacity-100'
				: 'opacity-50'}"
			on:click={() => toggleTag(tag)}>
			{tag}
		</button>
	{/each}
</div>

<div class="space-x-2 my-4">
	<button
		class="px-3 py-1 text-sm font-medium rounded-md {playTracks
			? 'opacity-100'
			: 'opacity-50'}"
		on:click={() => (playTracks = !playTracks)}>
		Play Tracks
	</button>
	<button
		class="px-3 py-1 text-sm font-medium rounded-md {playSets
			? 'opacity-100'
			: 'opacity-50'}"
		on:click={() => (playSets = !playSets)}>
		Play Sets
	</button>
</div>

<!-- svelte-ignore a11y-media-has-caption -->
<video
	id="video-js"
	class="video-js vjs-default-skin w-full aspect-video"
	controls
	preload="auto"
	width="640"
	height="264">
	<p class="vjs-no-js">
		To view this video please enable JavaScript, and consider upgrading to a
		web browser that
		<a href="https://videojs.com/html5-video-support/" target="_blank">
			supports HTML5 video
		</a>
	</p>
</video>
