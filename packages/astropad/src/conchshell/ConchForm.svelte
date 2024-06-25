<script>
    import { onMount } from 'svelte';
  
    let answerText = "";
    let lastMod = 0;
    const waitTime = 3000;
  
    let yesAudio;
    let noAudio;
  
    function sleep(time) {
      return new Promise((resolve) => setTimeout(resolve, time));
    }
  
    async function getAnswer() {
      try {
        const response = await fetch('https://your-api-endpoint.com/get-answer');
        const data = await response.json();
        playAnswer(data.answer);
      } catch (error) {
        console.error('Error fetching the answer:', error);
        answerText = "Error! Please try again.";
      }
    }
  
    function playAnswer(answer) {
      const audio = (answer.toLowerCase() === "yes") ? yesAudio : noAudio;
      audio.play();
      answerText = answer;
      lastMod = new Date().getTime();
      sleep(waitTime).then(() => {
        const time = new Date().getTime();
        if (time - lastMod >= waitTime) {
          answerText = "";
          lastMod = time;
        }
      });
    }
  
    onMount(() => {
      yesAudio = new Audio("res/yes.ogg");
      noAudio = new Audio("res/no.ogg");
    });
  </script>
  
  <div class="flex flex-col items-center justify-center min-h-screen">
    <h1 class="text-3xl font-bold mb-4">Ask the Shadow Magic Conch</h1>
    <button 
      on:click={getAnswer}
      class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-700 transition"
    >
      Ask
    </button>
    <p class="answer text-2xl mt-4">{answerText}</p>
  </div>