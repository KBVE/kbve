<script lang="ts" context="module">
  declare global {
    interface Window {
      sitekey: string; // 'sitekey' is a string property for storing the hCaptcha site key.
      hcaptchaOnLoad: Function; // 'hcaptchaOnLoad' is a function that gets called when hCaptcha loads.
      onSuccess: Function; // 'onSuccess' is a function that gets called on successful captcha resolution.
      onError: Function; // 'onError' is a function that gets called when there's an error in captcha processing.
      onClose: Function; // 'onClose' is a function that gets called when the captcha is closed.
      onExpired: Function; // 'onExpired' is a function that gets called when the captcha expires.
      hcaptcha: any; // 'hcaptcha' is a property to hold the hCaptcha instance or related data.
    }
  }

  declare var hcaptcha: any; // Declaring a global variable 'hcaptcha'. This is used to interact with the hCaptcha API.
</script>

<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { CaptchaTheme, hcaptcha_api, kbve_hcaptcha_site_key, removeLoader, type CaptchaConfig, type UIRegiserState } from '@kbve/laser';

  const dispatch = createEventDispatcher();

  export const reset = () => {
    loading = false;
    uiRegiserState.successful_message = '';
    if (mounted && loaded && widgetID) hcaptcha.reset(widgetID);
  };

  export const execute = (options: any) => {
    if (mounted && loaded && widgetID)
      return hcaptcha.execute(widgetID, options); // Executes captcha with given options if conditions are met.
  };

  const browser =
    import.meta.env.SSR === undefined ? true : !import.meta.env.SSR;

  let mounted = false;
  let loaded = false;
  let loading = false;
  let lottie_player_file = '';
  let errorMessageAstro: any;
  let widgetID: any;

  const captchaConfig: CaptchaConfig = {
    hl: '',
    sitekey: kbve_hcaptcha_site_key,
    apihost: hcaptcha_api,
    reCaptchaCompat: true,
    theme: CaptchaTheme.DARK,
    size: 'compact',
  };

  let uiRegiserState: UIRegiserState = {
    email: '',
    password: '',
    confirm: '',
    username: '',
    captchaToken: '',
    svelte_internal_message: '',
    successful_message: '',
  };

  const query = new URLSearchParams({
    recaptchacompat: captchaConfig.reCaptchaCompat ? 'on' : 'off',
    onload: 'hcaptchaOnLoad',
    render: 'explicit',
  });

  const scriptSrc = `${captchaConfig.apihost}?${query.toString()}`; // Constructing the full script source URL.
  const id = Math.floor(Math.random() * 100); // Generating a unique identifier for the captcha element.

  // Styles from ScrewFast
  export let baseClasses: string =
    'inline-flex w-full items-center justify-center gap-x-2 rounded-lg px-4 py-1 text-sm font-bold text-neutral-700 focus-visible:ring outline-none transition duration-300';
  export let borderClasses: string = 'border border-transparent';
  export let bgColorClasses: string = 'bg-yellow-400 dark:focus:outline-none';
  export let hoverClasses: string = 'hover:bg-yellow-500';
  export let fontSizeClasses: string = '2xl:text-base';
  export let disabledClasses: string =
    'disabled:pointer-events-none disabled:opacity-50 disabled:animate-pulse';
  export let ringClasses: string = 'ring-zinc-500 dark:ring-zinc-200';

  onMount(() => {
		const loader = removeLoader({ elementIdOrName: 'skeleton_login_loader', duration: 500 });

		if (document.getElementById('astro_error_message')) {
			errorMessageAstro = document.getElementById('astro_error_message');
		}
		

		// Setting up global functions for captcha callbacks.
		if (browser) {
			window.hcaptchaOnLoad = () => {
				dispatch('load'); // Dispatching 'load' event.
				loaded = true; // Marking captcha as loaded.
			};

			window.onSuccess = (token: any) => {
				dispatch('success', { token: token }); // Dispatching 'success' event with token.
				uiRegiserState.captchaToken = token; // Storing the captcha token.
			};

			window.onError = () => {
				dispatch('error'); // Dispatching 'error' event.
			};

			window.onClose = () => {
				dispatch('close'); // Dispatching 'close' event.
			};

			window.onExpired = () => {
				dispatch('expired'); // Dispatching 'expired' event.
				reset(); // Resetting captcha on expiration.
			};
		}

		dispatch('mount');
		mounted = true;
	});

  onDestroy(() => {
    if (browser) {
      //@ts-ignore
      window.hcaptchaOnLoad = null; // Removing global 'hcaptchaOnLoad' reference.
      //@ts-ignore
      window.onSuccess = null; // Removing global 'onSuccess' reference.
    }
    if (loaded) hcaptcha = null; // Nullify 'hcaptcha' if it was loaded, to prevent memory leaks.
  });
  
</script>

<svelte:head>
  {#if mounted && !window?.hcaptcha}
    <script src={scriptSrc} async defer></script>
  {/if}
</svelte:head>
