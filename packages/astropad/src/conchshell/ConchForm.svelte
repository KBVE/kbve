<script>
  import { onMount } from 'svelte';

  let answerText = '';
  let lastMod = 0;
  const waitTime = 3000;

  let yesAudio;
  let noAudio;
  let isProcessing = false;

  function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
  }

  function playAnswer(answer) {
    const audio = answer.toLowerCase() === 'yes' ? yesAudio : noAudio;
    audio.play();
    answerText = answer;
    lastMod = new Date().getTime();
    sleep(waitTime).then(() => {
      const time = new Date().getTime();
      if (time - lastMod >= waitTime) {
        answerText = '';
        lastMod = time;
        isProcessing = false;
      }
    });
  }

  async function submitQuestion(event) {
    event.preventDefault();
    const questionInput = document.getElementById('questionInput').value;
    isProcessing = true;
    try {
      const response = await fetch('https://rust.kbve.com/api/v1/call_groq', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: questionInput }),
      });
      const result = await response.json();
      answerText = result.answer ? 'Yes' : 'No';
    } catch (error) {
      console.error('Error submitting the question:', error);
      answerText = 'Error! Please try again.';
    }
    isProcessing = false;
  }

  onMount(() => {
    yesAudio = new Audio('https://kbve.com/embed/conch/yes.ogg');
    noAudio = new Audio('https://kbve.com/embed/conch/no.ogg');
  });
</script>

<div
  class="flex flex-col items-center justify-center min-h-screen bg-cover"
  style="background-image: url('https://kbve.com/embed/conch/bg.jpg');"
>
  <img
    src={isProcessing
      ? 'https://kbve.com/embed/conch/conch_shell_glow.png'
      : 'https://kbve.com/embed/conch/conch_shell.png'}
    alt="Conch Shell"
    class="conch-shell {isProcessing ? 'rotate' : ''}"
    style="opacity: {isProcessing ? 0.5 : 1};"
  />
  <h1 class="text-3xl font-bold mb-4">Ask the Shadow Magic Conch</h1>
  <form id="questionForm" class="w-full max-w-sm" on:submit={submitQuestion}>
    <div class="mb-4">
      <input
        type="text"
        id="questionInput"
        class="px-4 py-2 w-full border rounded"
        placeholder="Enter your question here"
        required
      />
    </div>
    <button
      type="submit"
      class="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-700 transition"
    >
      Ask
    </button>
  </form>

  <p class="answer text-2xl mt-4">{answerText}</p>
</div>

<style>
  .conch-shell {
    transition: opacity 0.5s ease;
  }

  .rotate {
    animation: rotate 1s infinite alternate;
  }

  @keyframes rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(10deg);
    }
  }
</style>
