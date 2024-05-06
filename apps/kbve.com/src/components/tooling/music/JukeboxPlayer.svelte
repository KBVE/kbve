
<svelte:head>
	<link
		href="https://unpkg.com/video.js/dist/video-js.min.css"
		rel="stylesheet" />
	<script src="https://unpkg.com/video.js/dist/video.min.js"></script>
	<script
		src="https://unpkg.com/videojs-youtube/dist/Youtube.min.js"></script>
</svelte:head>

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

	let player: any;
	let ytTracks: string[] = [];
	let ytSets: string[] = [];
	let intervalCheck: number | undefined;
	let playTracks = true; // Toggle for playing tracks
	let playSets = false; // Toggle for playing sets

	// Fetch the music data
	async function fetchMusicData() {
		const response = await fetch('/api/music.json');
		const data = await response.json();
		ytTracks = data.items.flatMap(
			(item: { ytTracks: any }) => item.ytTracks,
		);
		ytSets = data.items.flatMap((item: { ytSets: any }) => item.ytSets);

		// Initialize the player after data is fetched
		initializePlayer();
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
		}
		else {
			setTimeout(initializePlayer, 100); // Retry after 100ms
		}
	}

	function getActiveVideos() {
		return [...(playTracks ? ytTracks : []), ...(playSets ? ytSets : [])];
	}

	function loadNextVideo() {
		const allVideos = getActiveVideos();
		if (allVideos.length === 0) return; // Prevent loading if no videos are available

		const nextVideoId = allVideos[Math.floor(Math.random() * allVideos.length)];
		player.src({
			type: 'video/youtube',
			src: `https://www.youtube.com/watch?v=${nextVideoId}`,
		});
		player.play();
	}

	onMount(() => {
		fetchMusicData();
	});

	onDestroy(() => {
		if (player) {
			player.dispose();
		}
	});
</script>

<div>
	<label>
		<input type="checkbox" bind:checked={playTracks} />
		Play Tracks
	</label>
	<label>
		<input type="checkbox" bind:checked={playSets} />
		Play Sets
	</label>
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
