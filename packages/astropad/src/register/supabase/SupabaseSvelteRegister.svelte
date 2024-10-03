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
	import {
		CaptchaTheme,
		kilobase,
		removeLoader,
		type UIRegiserState,
		// ClientSideRegex,
		KiloBaseState,
	} from '@kbve/laser';

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

	export const handleRegister = async () => {
  loading = true;

  // Create the action ID and handle errors
  actionId = await kilobase.createActionULID('registerUser');
  if (!actionId) {
    uiRegiserState.svelte_internal_message = 'Failed to create action!';
    reset();
    return;
  }

  try {
    // Call registerUser with actionId
    const registeredProfile = await kilobase.registerUser(
      uiRegiserState.email,
      uiRegiserState.password,
      uiRegiserState.confirm,
      actionId,
      uiRegiserState.username,
      uiRegiserState.captchaToken,
    );

    // If registration is successful, show a success message
    if (registeredProfile) {
      uiRegiserState.successful_message = `Welcome, ${registeredProfile.username || registeredProfile.email}! Registration successful.`;
      console.log('User registered and profile saved:', registeredProfile);
      return; // End function early if successful
    }

    // Check for any error messages associated with this action ID if no profile was returned
    await displayErrorFromAction(actionId);
  } catch (error) {
    console.error('Registration failed:', error);

    // Handle any errors caught during registration
    await displayErrorFromAction(actionId);
  } finally {
    loading = false;
  }
};

/**
 * Helper function to retrieve and display error messages based on actionId.
 * @param actionId - The action ID to look up errors for.
 */
const displayErrorFromAction = async (actionId: string) => {
  const errorMessage = await kilobase.getErrorByActionId(actionId);
  if (errorMessage) {
    uiRegiserState.svelte_internal_message = errorMessage;
  } else {
    uiRegiserState.svelte_internal_message = 'An unexpected error occurred. Please try again.';
  }
};

	const browser =
		import.meta.env.SSR === undefined ? true : !import.meta.env.SSR;

	let mounted = false;
	let loaded = false;
	let loading = false;
	let lottie_player_file = '/assets/lottie/register.lottie';
	let errorMessageAstro: any;
	let widgetID: any;
	let actionId: string;

	export let hl: string = '';
	export let sitekey: string = KiloBaseState.get().hcaptcha; // Exporting 'sitekey', initially set from 'kbve' module.
	export let apihost: string = KiloBaseState.get().hcaptcha_api;
	export let reCaptchaCompat: boolean = true; // Exporting 'reCaptchaCompat', initially set to false.
	export let theme: CaptchaTheme = CaptchaTheme.DARK; // Exporting 'theme', initially set to 'CaptchaTheme.DARK'.
	export let size: 'normal' | 'compact' | 'invisible' = 'compact'; // Exporting 'size', with three possible values, initially 'compact'.

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
		recaptchacompat: reCaptchaCompat ? 'on' : 'off',
		onload: 'hcaptchaOnLoad',
		render: 'explicit',
	});

	const scriptSrc = `${apihost}?${query.toString()}`; // Constructing the full script source URL.
	const id = Math.floor(Math.random() * 100); // Generating a unique identifier for the captcha element.

	const baseClasses =
		'inline-flex w-full items-center justify-center gap-x-2 rounded-lg px-4 py-1 text-sm font-normal text-blue-400 focus-visible:ring outline-none transition duration-300 py-3';
	const borderClasses = 'border border-transparent';
	const bgColorClasses = 'bg-blue-100 dark:focus:outline-none';
	const hoverClasses = 'hover:bg-blue-400 hover:text-white';
	const fontSizeClasses = '2xl:text-base';
	const disabledClasses =
		'disabled:pointer-events-none disabled:opacity-50 disabled:animate-pulse';
	const ringClasses = 'ring-zinc-500 dark:ring-zinc-200';

	onMount(() => {
		const loader = removeLoader({
			elementIdOrName: 'skeleton_login_loader',
			duration: 500,
		});

		if (document.getElementById('astro_error_message')) {
			errorMessageAstro = document.getElementById('astro_error_message');
		}

		const formElement = document.getElementById('registerForm');
		if (formElement) {
			setTimeout(() => {
				formElement.classList.replace('opacity-0', 'opacity-100');
			}, 100);
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
	$: if (mounted && loaded) {
		widgetID = hcaptcha.render(`h-captcha-${id}`, {
			// Rendering the captcha widget.
			sitekey,
			hl, // Setting the language.
			theme,
			callback: 'onSuccess',
			'error-callback': 'onError',
			'close-callback': 'onClose',
			'expired-callback': 'onExpired',
			size,
		});
	}

	
</script>

<svelte:head>
	{#if mounted && !window?.hcaptcha}
		<script src={scriptSrc} async defer></script>
	{/if}
</svelte:head>



<div class="">

	{#if loading}

	<div class="max-w-xs bg-white border border-gray-200 rounded-xl shadow-lg dark:bg-neutral-800 dark:border-neutral-700 z-100	" role="alert" tabindex="-1" aria-labelledby="hs-toast-normal-example-label">
		<div class="flex p-4">
		  <div class="shrink-0">
			<svg class="shrink-0 size-4 text-blue-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
			  <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"></path>
			</svg>
		  </div>
		  <div class="ms-3">
			<p id="hs-toast-normal-example-label" class="text-sm text-gray-700 dark:text-neutral-400">
			  Processing...
			</p>
		  </div>
		</div>
	</div>

	{/if}

	{#if uiRegiserState.svelte_internal_message}

		<!-- Toast -->

		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div class="max-w-xs bg-white border border-gray-200 rounded-xl shadow-lg dark:bg-neutral-800 dark:border-neutral-700 z-100" role="alert" tabindex="-1" aria-labelledby="hs-toast-error-example-label" on:click|preventDefault={reset}>
			<div class="flex p-4">
			  <div class="shrink-0">
				<svg class="shrink-0 size-4 text-red-500 mt-0.5" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
				  <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM5.354 4.646a.5.5 0 1 0-.708.708L7.293 8l-2.647 2.646a.5.5 0 0 0 .708.708L8 8.707l2.646 2.647a.5.5 0 0 0 .708-.708L8.707 8l2.647-2.646a.5.5 0 0 0-.708-.708L8 7.293 5.354 4.646z"></path>
				</svg>
			  </div>
			  <div class="ms-3">
				<p id="hs-toast-error-example-label" class="text-sm text-gray-700 dark:text-neutral-400">
					{uiRegiserState.svelte_internal_message}
				</p>
			  </div>
			</div>
		  </div>
		  <!-- End Toast -->
		
	{/if}

	{#if uiRegiserState.successful_message}
		<div class="flex">
			<dotlottie-player
				autoplay
				loop
				class="w-8"
				mode="normal"
				src="/assets/lottie/{lottie_player_file}">
			</dotlottie-player>
			<span class="text-lg text-cyan-600 dark:text-cyan-300">
				{uiRegiserState.successful_message}
			</span>
		</div>
	{/if}
	<form
		id="registerForm"
		class="opacity-0 transition-opacity duration-500"
		action="#"
		on:submit|preventDefault={handleRegister}>
		<div class="grid gap-y-2 md:gap-y-4">
			<div>
				<label
					for="login-username"
					class="mb-1 block text-xs text-left md:text-sm md:mb-2 text-neutral-800 dark:text-neutral-200">
					Username
				</label>

				<div>
					<input
						type="text"
						id="register-username"
						name="username"
						autocomplete="username"
						class="block w-full h-4 md:h-12 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="register-username"
						bind:value={uiRegiserState.username} />
				</div>
			</div>

			<div>
				<label
					for="register-email"
					class="mb-1 block text-xs text-left md:text-sm md:mb-2 text-neutral-800 dark:text-neutral-200">
					Email Address
				</label>

				<div>
					<input
						type="email"
						id="register-email"
						name="email"
						autocomplete="email"
						class="block w-full h-4 md:h-12 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="register-email"
						bind:value={uiRegiserState.email} />
				</div>
			</div>

			<div>
				<div class="flex items-center justify-between">
					<label
						for="register-password"
						class="mb-1 block text-xs md:text-sm md:mb-2 text-neutral-800 dark:text-neutral-200">
						Password
					</label>
				</div>
				<div>
					<input
						type="password"
						id="register-password"
						name="password"
						class="block w-full h-4 md:h-12 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="register-password"
						bind:value={uiRegiserState.password} />
				</div>
			</div>

			<div>
				<div class="flex items-center justify-between">
					<label
						for="confirm-register-password"
						class="mb-1 block text-xs md:text-sm md:mb-2 text-neutral-800 dark:text-neutral-200">
						Confirm Password
					</label>
				</div>
				<div>
					<input
						type="password"
						id="confirm-register-password"
						name="password"
						class="block w-full h-4 md:h-12 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="confirm-register-password"
						bind:value={uiRegiserState.confirm} />
				</div>
			</div>

			<div>
				<div
					id="h-captcha-{id}"
					class="flex justify-center scale-75 md:scale-100" />
			</div>

			<button
				type="submit"
				class={`${baseClasses} ${borderClasses} ${bgColorClasses} ${hoverClasses} ${fontSizeClasses} ${disabledClasses} ${ringClasses}`}
				disabled={loading}>
				{loading ? 'Loading...' : 'Register'}
			</button>
		</div>
	</form>
</div>
