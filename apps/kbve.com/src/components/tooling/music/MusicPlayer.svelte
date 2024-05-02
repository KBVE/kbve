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
  
  let playerA: any, playerB: any;
  let currentPlayer = 'A';
  let intervalCheck: number | undefined;


  onMount(() => {
    window.onYouTubeIframeAPIReady = function() {
      playerA = createPlayer('playerA', 'p6AcPxDK7Bg');
      playerB = createPlayer('playerB', 'ODXq4FtS-ys');
    };
  });

  function createPlayer(elementId: string, videoId: string) {
    return new YT.Player(elementId, {
      height: '360',
      width: '640',
      videoId: videoId,
      playerVars: {
        'autoplay': 0,
        'controls': 1,
        'volume': 10
      },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': (event: any) => onPlayerStateChange(event, elementId)
      }
    });
  }

  function onPlayerReady(event: { target: { setVolume: (arg0: number) => void; playVideo: () => void; }; }) {
    event.target.setVolume(100); // Start with full volume
    event.target.playVideo();
  }

  function onPlayerStateChange(event: { data: any; }, playerId: string) {
    if (event.data === YT.PlayerState.PLAYING) {
      if (!intervalCheck) {
        intervalCheck = setInterval(() => checkVideoStatus(playerId), 1000) as unknown as number;
      }
    }
  }

  function checkVideoStatus(playerId: string) {
    let player = playerId === 'playerA' ? playerA : playerB;
    let otherPlayer = playerId === 'playerA' ? playerB : playerA;
    let duration = player.getDuration();
    let currentTime = player.getCurrentTime();
    let timeLeft = duration - currentTime;

    if (timeLeft <= 15) {
      // Start loading and playing the other video
      otherPlayer.playVideo();
    }

    if (timeLeft <= 15 && timeLeft > 0) {
      // Transition volumes
      let newVolume = Math.max(10, 100 - (15 - timeLeft) * 6);
      player.setVolume(newVolume);
      otherPlayer.setVolume(110 - newVolume);
    }

  
    if (timeLeft <= 0) {
            clearInterval(intervalCheck);
            intervalCheck = undefined;
            loadNextVideo(playerId); // Load next video in the player that just ended
        }
  }

  function loadNextVideo(playerId: string) {
    let player = playerId === 'playerA' ? playerA : playerB;
    player.loadVideoById('nextVideoIdFor' + playerId.toUpperCase());
    // Assume 'nextVideoIdForA' and 'nextVideoIdForB' are defined or fetched dynamically
  }

  onDestroy(() => {
    clearInterval(intervalCheck);
  });
</script>


<svelte:head>
  <script src="https://www.youtube.com/iframe_api" async></script>
</svelte:head>


<div id="playerA"></div>
<div id="playerB"></div>