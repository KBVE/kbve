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
		KiloBaseState,
		removeLoader,
		type CaptchaConfig,
		type UIRegiserState,
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
		sitekey: KiloBaseState.get().hcaptcha,
		apihost: KiloBaseState.get().hcaptcha_api,
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

<div>
	{#if uiRegiserState.svelte_internal_message}
		<div class="flex">
			<dotlottie-player
				autoplay
				loop
				class="w-8"
				mode="normal"
				src="/assets/lottie/{lottie_player_file}">
			</dotlottie-player>
			<span class="text-lg text-red-600 dark:text-red-300">
				{uiRegiserState.svelte_internal_message}
			</span>
		</div>
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
                    class="mb-1 block text-xs md:text-sm md:mb-2  text-neutral-800 dark:text-neutral-200">
                    Password
                </label>
            </div>
            <div>
                <input
                    type="password"
                    id="register-password"
                    name="password"
                    class="block w-full h-4 md:h-12  rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
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
                    class="block w-full h-4 md:h-12  rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
                    required
                    aria-describedby="confirm-register-password"
                    bind:value={uiRegiserState.confirm} />
            </div>
        </div>

        <div>
            <div id="h-captcha-{id}" class="flex justify-center scale-75 md:scale-100" />
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
