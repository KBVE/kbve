<script lang="ts" context="module">
	// Summary:
	// This Svelte script block is written in TypeScript and is scoped as a module.
	// It extends the global Window interface with properties related to hCaptcha functionality.
	// The script also declares a variable 'hcaptcha' and exports an enum 'CaptchaTheme'
	// with possible theme values for the captcha.

	// Extending the global Window interface to include custom properties and functions
	// related to hCaptcha, a popular CAPTCHA service.
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

	// Declaring a global variable 'hcaptcha'. This is used to interact with the hCaptcha API.
	declare var hcaptcha: any;

	// Exporting an enum 'CaptchaTheme' with two themes - DARK and LIGHT.
	// These are used to set the visual theme of the captcha widget.
	export enum CaptchaTheme {
		DARK = 'dark', // Represents the dark theme.
		LIGHT = 'light', // Represents the light theme.
	}
</script>

<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import {
		locker,
		kbve$,
		registerUser,
		profileWithToken,
		sleep,
		hcaptcha_site_key,
		hcaptcha_api,
	} from '@kbve/khashvault';

	const dispatch = createEventDispatcher();

	export const reset = () => {
		loading = false;
		successful_message = '';
		if (mounted && loaded && widgetID) hcaptcha.reset(widgetID);
	};

	export const execute = (options: any) => {
		if (mounted && loaded && widgetID)
			return hcaptcha.execute(widgetID, options); // Executes captcha with given options if conditions are met.
	};

	// Browser
	const browser =
		import.meta.env.SSR === undefined ? true : !import.meta.env.SSR;

	// UX
	let mounted = false;
	let loaded = false;
	let loading = false;
	let lottie_player_file = '';
	let errorMessageAstro: any;
	let widgetID: any;
	export let hl: string = '';
	export let sitekey: string = hcaptcha_site_key; // Exporting 'sitekey', initially set from 'kbve' module.
	export let apihost: string = hcaptcha_api;
	export let reCaptchaCompat: boolean = false; // Exporting 'reCaptchaCompat', initially set to false.
	export let theme: CaptchaTheme = CaptchaTheme.DARK; // Exporting 'theme', initially set to 'CaptchaTheme.DARK'.
	export let size: 'normal' | 'compact' | 'invisible' = 'compact'; // Exporting 'size', with three possible values, initially 'compact'.

	const query = new URLSearchParams({
		recaptchacompat: reCaptchaCompat ? 'on' : 'off', // Setting recaptcha compatibility mode.
		onload: 'hcaptchaOnLoad', // Onload callback name.
		render: 'explicit', // Rendering mode.
	});
	const scriptSrc = `${apihost}?${query.toString()}`; // Constructing the full script source URL.
	// Generating a unique identifier for the captcha element.
	const id = Math.floor(Math.random() * 100);

	// UI
	let email = '';
	let password = '';
	let confirm = '';
	let username = '';
	let captchaToken = '';
	let svelte_internal_message = '';
	let successful_message = '';

	// Styles from ScrewFast
	const baseClasses =
		'inline-flex w-full items-center justify-center gap-x-2 rounded-lg px-4 py-3 text-sm font-bold text-neutral-700 focus-visible:ring outline-none transition duration-300';
	const borderClasses = 'border border-transparent';
	const bgColorClasses = 'bg-yellow-400 dark:focus:outline-none';
	const hoverClasses = 'hover:bg-yellow-500';
	const fontSizeClasses = '2xl:text-base';
	const disabledClasses =
		'disabled:pointer-events-none disabled:opacity-50 disabled:animate-pulse';
	const ringClasses = 'ring-zinc-500 dark:ring-zinc-200';

	onMount(() => {
		const loader = document.getElementById('skeleton_login_loader');

		if (document.getElementById('astro_error_message')) {
			errorMessageAstro = document.getElementById('astro_error_message');
		}
		if (loader) {
			loader.classList.add(
				'opacity-0',
				'transition-opacity',
				'duration-500',
			);

			// Set a timeout to hide the loader after the transition completes
			setTimeout(() => {
				loader.style.display = 'none';
			}, 500); // Duration matches the transition time
		}

		// Setting up global functions for captcha callbacks.
		if (browser) {
			window.hcaptchaOnLoad = () => {
				dispatch('load'); // Dispatching 'load' event.
				loaded = true; // Marking captcha as loaded.
			};

			window.onSuccess = (token: any) => {
				dispatch('success', { token: token }); // Dispatching 'success' event with token.
				captchaToken = token; // Storing the captcha token.
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

	const handleRegister = async () => {
		loading = true;
		svelte_internal_message = '';

		const taskRegister = await registerUser(
			'https://rust.kbve.com',
			username,
			email,
			password,
			captchaToken,
		);

		if (taskRegister.error) {
			taskRegister.display()
			switch (taskRegister.extractField('error')) {
				case 'invalid_password':
					svelte_internal_message = 'Invalid Password';
					lottie_player_file = 'pray.lottie';
					break;
				case 'auth_error':
					svelte_internal_message = 'Invalid Auth Method';
					lottie_player_file = 'monkeymeme.lottie';
					break;
				case 'email-exists':
				svelte_internal_message = 'Email is Taken';
					lottie_player_file = 'monkeymeme.lottie';
				default:
					svelte_internal_message = taskRegister.extractError();
			}
			reset();
		} else {
			taskRegister.display();
			svelte_internal_message = '';
			lottie_player_file = 'holydance.lottie';
			successful_message =
				'Yay! SucklessFully Dance, while I get dat profile!';
			await sleep(500);
			const taskProfile = await profileWithToken(
				'https://rust.kbve.com',
				taskRegister.token(),
			);

			if (taskProfile.error) {
				switch (taskProfile.extractError()) {
					default:
						svelte_internal_message = taskProfile.extractError();
						reset();
				}
			} else {
				locker('username', taskProfile.extractField('username'));
				locker('email', taskProfile.extractField('email'));
				locker('uuid', taskProfile.extractField('userid'));
				location.href = '/dashboard';
			}
		}
	};

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
	<!-- Svelte special element 'svelte:head' allows for injecting elements into the <head> of the document -->
	<!-- This block dynamically loads the hCaptcha script into the page's head section -->

	{#if mounted && !window?.hcaptcha}
		<!-- Conditional rendering: -->
		<!-- Checks if 'mounted' is true and 'hcaptcha' is not already present on the window object. -->
		<!-- This prevents the script from being loaded multiple times. -->

		<!-- This prevents the script from being loaded multiple times. -->
		<script src={scriptSrc} async defer></script>
		<!-- Injecting the hCaptcha script tag into the head of the document. -->
		<!-- 'scriptSrc' is the source URL of the hCaptcha script, constructed earlier in the component. -->
		<!-- 'async' attribute allows the script to be downloaded asynchronously with the rest of the page. -->
		<!-- 'defer' attribute defers execution of the script until the HTML document is fully parsed. -->
	{/if}
</svelte:head>

{#if $kbve$.username}
	<div class="object-contain">
		<a href="/dashboard/">
			<button
				class="relative rounded px-5 py-2.5 overflow-hidden group bg-cyan-500 relative hover:bg-gradient-to-r hover:from-cyan-500 hover:to-cyan-400 text-white hover:ring-2 hover:ring-offset-2 hover:ring-cyan-400 transition-all ease-out duration-300">
				<span
					class="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease">
				</span>
				<span class="relative">
					{$kbve$.username} Enter The Dashboard
				</span>
			</button>
		</a>
	</div>
{/if}

<div class="mt-5">
	<div class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
		Register through the KBVE Auth Portal!
	</div>

	{#if svelte_internal_message}
		<div class="flex">
			<dotlottie-player
				autoplay
				loop
				class="w-24"
				mode="normal"
				src="/assets/lottie/{lottie_player_file}">
			</dotlottie-player>
			<span class="text-lg text-red-600 dark:text-red-300">
				{svelte_internal_message}
			</span>
		</div>
	{/if}

	{#if successful_message}
		<div class="flex">
			<dotlottie-player
				autoplay
				loop
				class="w-24"
				mode="normal"
				src="/assets/lottie/{lottie_player_file}">
			</dotlottie-player>
			<span class="text-lg text-cyan-600 dark:text-cyan-300">
				{successful_message}
			</span>
		</div>
	{/if}

	<div
		class="flex items-center py-3 text-xs uppercase text-neutral-400 before:me-6 before:flex-[1_1_0%] before:border-t before:border-neutral-200 after:ms-6 after:flex-[1_1_0%] after:border-t after:border-neutral-200 dark:text-neutral-500 dark:before:border-neutral-600 dark:after:border-neutral-600">
		Or
	</div>

	<form
		id="registerForm"
		action="#"
		on:submit|preventDefault={handleRegister}>
		<div class="grid gap-y-4">
			<!--TODO Username - START -->
			<div>
				<label
					for="login-username"
					class="mb-2 block text-sm text-neutral-800 dark:text-neutral-200">
					Username
				</label>

				<div class="relative">
					<input
						type="text"
						id="register-username"
						name="username"
						autocomplete="username"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="register-username"
						bind:value={username} />
					<!-- Hidden error icon -->
					<div
						class="pointer-events-none absolute inset-y-0 end-0 hidden pe-3">
						<svg
							class="h-5 w-5 text-red-500"
							width="16"
							height="16"
							fill="currentColor"
							viewBox="0 0 16 16"
							aria-hidden="true">
							<path
								d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z">
							</path>
						</svg>
					</div>
					<p
						class="mt-2 hidden text-xs text-red-600"
						id="register-username-error">
						Please include a valid username!
					</p>
				</div>
			</div>

			<!-- Username - END -->

			<!--? Email - START -->

			<div>
				<!-- Label for the email input field -->
				<label
					for="register-email"
					class="mb-2 block text-sm text-neutral-800 dark:text-neutral-200">
					Email Address
				</label>
				<!-- Label for the email input field -->
				<div class="relative">
					<!-- Email input field -->
					<input
						type="email"
						id="register-email"
						name="email"
						autocomplete="email"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="register-email"
						bind:value={email} />
					<!-- Hidden error icon -->
					<div
						class="pointer-events-none absolute inset-y-0 end-0 hidden pe-3">
						<svg
							class="h-5 w-5 text-red-500"
							width="16"
							height="16"
							fill="currentColor"
							viewBox="0 0 16 16"
							aria-hidden="true">
							<path
								d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z">
							</path>
						</svg>
					</div>
				</div>
				<!-- Validation message which is hidden by default -->
				<p
					class="mt-2 hidden text-xs text-red-600"
					id="register-email-error">
					Please include a valid email address so we can get back to
					you
				</p>
			</div>

			<!-- Email - END -->

			<!--? Password START -->

			<div>
				<div class="flex items-center justify-between">
					<label
						for="register-password"
						class="mb-2 block text-sm text-neutral-800 dark:text-neutral-200">
						Password
					</label>
				</div>
				<div class="relative">
					<input
						type="password"
						id="register-password"
						name="password"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="register-password"
						bind:value={password} />
					<div
						class="pointer-events-none absolute inset-y-0 end-0 hidden pe-3">
						<svg
							class="h-5 w-5 text-red-500"
							width="16"
							height="16"
							fill="currentColor"
							viewBox="0 0 16 16"
							aria-hidden="true">
							<path
								d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z">
							</path>
						</svg>
					</div>
				</div>
				<p
					class="mt-2 hidden text-xs text-red-600"
					id="register-password-error">
					8+ characters required
				</p>
			</div>

			<!-- Password END -->

			<!-- Confirm START -->

			<div>
				<div class="flex items-center justify-between">
					<label
						for="confirm-register-password"
						class="mb-2 block text-sm text-neutral-800 dark:text-neutral-200">
						Confirm Password
					</label>
				</div>
				<div class="relative">
					<input
						type="password"
						id="confirm-register-password"
						name="password"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="confirm-register-password"
						bind:value={confirm} />
					<div
						class="pointer-events-none absolute inset-y-0 end-0 hidden pe-3">
						<svg
							class="h-5 w-5 text-red-500"
							width="16"
							height="16"
							fill="currentColor"
							viewBox="0 0 16 16"
							aria-hidden="true">
							<path
								d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8 4a.905.905 0 0 0-.9.995l.35 3.507a.552.552 0 0 0 1.1 0l.35-3.507A.905.905 0 0 0 8 4zm.002 6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z">
							</path>
						</svg>
					</div>
				</div>
				<p
					class="mt-2 hidden text-xs text-red-600"
					id="confirm-register-password-error">
					8+ characters required
				</p>
			</div>

			<!--! Confirm END -->

			<!--TODO Captcha START -->
			<div>
				<div id="h-captcha-{id}" class="flex justify-center" />
			</div>

			<!--! Captcha END -->

			<!--TODO Legal START -->
			<div></div>
			<!--! Legal END -->

			<!--TODO Submit -->
			<button
				type="submit"
				class={`${baseClasses} ${borderClasses} ${bgColorClasses} ${hoverClasses} ${fontSizeClasses} ${disabledClasses} ${ringClasses}`}
				disabled={loading}>
				{loading ? 'Loading...' : 'Register'}
			</button>
		</div>
	</form>
</div>
