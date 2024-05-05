<script lang="ts" context="module">
  declare global {
    interface Window {
      onYouTubeIframeAPIReady: () => void;
    }
  }
  declare var YT: any;
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
    ytTracks = data.items.flatMap((item: { ytTracks: any; }) => item.ytTracks);
    ytSets = data.items.flatMap((item: { ytSets: any; }) => item.ytSets);

    // Initialize the player after data is fetched
    initializePlayer();
  }

  function initializePlayer() {
    const allVideos = getActiveVideos();
    const initialVideoId = allVideos[Math.floor(Math.random() * allVideos.length)]; // Random initial video
    window.onYouTubeIframeAPIReady = function() {
      player = createPlayer('player', initialVideoId);
    };
  }

  function getActiveVideos() {
    return [
      ...(playTracks ? ytTracks : []),
      ...(playSets ? ytSets : [])
    ];
  }

  onMount(() => {
    fetchMusicData();
  });

  function createPlayer(elementId: string, videoId: string) {
    return new YT.Player(elementId, {
      height: '500',
      width: '100%',
      videoId: videoId,
      playerVars: {
        'autoplay': 1, // Automatically start playing
        'controls': 1,
        'volume': 100
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  }

  function onPlayerReady(event: { target: { playVideo: () => void; }; }) {
    event.target.playVideo();
  }

  function onPlayerStateChange(event: { data: any; }) {
    if (event.data === YT.PlayerState.PLAYING && !intervalCheck) {
      intervalCheck = setInterval(checkVideoStatus, 1000) as unknown as number;
    }
  }

  function checkVideoStatus() {
    let duration = player.getDuration();
    let currentTime = player.getCurrentTime();
    let timeLeft = duration - currentTime;

    if (timeLeft <= 1) {
      loadNextVideo();
    }
  }

  function loadNextVideo() {
    const allVideos = getActiveVideos();
    if (allVideos.length === 0) return; // Prevent loading if no videos are available

    const nextVideoId = allVideos[Math.floor(Math.random() * allVideos.length)];
    player.loadVideoById(nextVideoId);
  }

  onDestroy(() => {
    if (intervalCheck) {
      clearInterval(intervalCheck);
    }
  });
</script>

<svelte:head>
  <script src="https://www.youtube.com/iframe_api" async></script>
</svelte:head>

<div>
  <label>
    <input type="checkbox" bind:checked={playTracks}>
    Play Tracks
  </label>
  <label>
    <input type="checkbox" bind:checked={playSets}>
    Play Sets
  </label>
</div>
<div id="player" class="w-full aspect-video"></div>
