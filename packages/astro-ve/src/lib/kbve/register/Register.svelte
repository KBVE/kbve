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
	declare var Toastify: any;

	// Exporting an enum 'CaptchaTheme' with two themes - DARK and LIGHT.
	// These are used to set the visual theme of the captcha widget.
	export enum CaptchaTheme {
		DARK = 'dark', // Represents the dark theme.
		LIGHT = 'light', // Represents the light theme.
	}
</script>

<script lang="ts">
	// [IMPORTS]
	// Importing required modules and functions from relative paths and Svelte.
	import * as kbve from '../../kbve'; // Importing custom module 'kbve'.
	import { notification, toast$ } from '../../storage'; // Importing custom module 'storage'.

	import { onMount, onDestroy, createEventDispatcher } from 'svelte'; // Importing Svelte lifecycle and event functions.

	// Determining if the current environment is a browser or server-side rendering (SSR).
	const browser =
		import.meta.env.SSR === undefined ? true : !import.meta.env.SSR;

	// Creating an event dispatcher to handle custom events.
	const dispatch = createEventDispatcher();

	// Exporting variables and setting their initial values.
	export let domain: string = ''; // Exporting 'domain'
	export let className: string = ''; // Exporting 'className', wrapping the section tag.
	export let redirect: boolean = false; // Exporting 'redirect', initially set to false.
	export let sitekey: string = kbve.hcaptcha_site_key; // Exporting 'sitekey', initially set from 'kbve' module.
	export let apihost: string = kbve.hcaptcha_api; // Exporting 'apihost', initially set from 'kbve' module.
	export let hl: string = ''; // Exporting 'hl' (language code), initially empty.
	export let reCaptchaCompat: boolean = false; // Exporting 'reCaptchaCompat', initially set to false.
	export let theme: CaptchaTheme = CaptchaTheme.DARK; // Exporting 'theme', initially set to 'CaptchaTheme.DARK'.
	export let size: 'normal' | 'compact' | 'invisible' = 'compact'; // Exporting 'size', with three possible values, initially 'compact'.

	// Defining the 'reset' function to reset the captcha widget.
	export const reset = () => {
		if (mounted && loaded && widgetID) hcaptcha.reset(widgetID); // Resets captcha if it's mounted, loaded, and has an ID.
	};

	// Defining the 'execute' function to manually trigger the captcha challenge.
	export const execute = (options: any) => {
		if (mounted && loaded && widgetID)
			return hcaptcha.execute(widgetID, options); // Executes captcha with given options if conditions are met.
	};

	//	Defining the 'toast' function to manually trigger the toast.
	export const toast = () => {
		if (mounted && loaded) {
			new Toastify({
				text: $toast$,
				duration: 3000,
				destination: '#',
				newWindow: false,
				close: true,
				gravity: 'top', // `top` or `bottom`
				position: 'right', // `left`, `center` or `right`
				stopOnFocus: true, // Prevents dismissing of toast on hover
				style: {
					background: 'linear-gradient(to right, #FF8A4C, #8DA2FB)',
				},
				//onClick: function(){} // Callback after click
			}).showToast();
		}
	};

	// Generating a unique identifier for the captcha element.
	const id = Math.floor(Math.random() * 100);

	// Initializing state variables.
	let mounted = false; // Indicates if component is mounted.
	let loaded = false; // Indicates if captcha is loaded.
	let widgetID: any; // Stores the ID of the captcha widget.
	let skeleton: any; // Reference to a skeleton or placeholder element.

	// Constructing the query string for the captcha script.
	const query = new URLSearchParams({
		recaptchacompat: reCaptchaCompat ? 'on' : 'off', // Setting recaptcha compatibility mode.
		onload: 'hcaptchaOnLoad', // Onload callback name.
		render: 'explicit', // Rendering mode.
	});
	const scriptSrc = `${apihost}?${query.toString()}`; // Constructing the full script source URL.

	// Lifecycle hook: onMount - called when component is mounted in the DOM.
	onMount(() => {
		if (browser && !sitekey) sitekey = window.sitekey; // If in a browser and 'sitekey' is empty, use the global 'sitekey'.

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

		dispatch('mount'); // Dispatching 'mount' event.
		mounted = true; // Marking component as mounted.
	});

	// Lifecycle hook: onDestroy - called when component is about to be destroyed.
	onDestroy(() => {
		if (browser) {
			//@ts-ignore
			window.hcaptchaOnLoad = null; // Removing global 'hcaptchaOnLoad' reference.
			//@ts-ignore
			window.onSuccess = null; // Removing global 'onSuccess' reference.
		}
		if (loaded) hcaptcha = null; // Nullify 'hcaptcha' if it was loaded, to prevent memory leaks.
	});

	interface ValidationResult {
		isValid: boolean;
		error: string | null;
	}

	// Assuming reset, notification, and toast are defined globally or imported
	async function validateField(
		validator: (value: string) => Promise<ValidationResult>,
		value: string,
	): Promise<boolean> {
		try {
			const { isValid, error } = await validator(value);
			if (!isValid) {
				reset();
				if (error) {
					notification(error);
					toast();
				}
				return false;
			}
			return true;
		} catch (e) {
			reset();
			console.error(e);
			return false;
		}
	}
	//	Logic
	const handleRegister = async () => {
		const isUsernameValid = await validateField(
			kbve.checkUsername,
			username,
		);
		if (!isUsernameValid) return;

		const isEmailValid = await validateField(kbve.checkEmail, email);
		if (!isEmailValid) return;

		const isPasswordValid = await validateField(
			kbve.checkPassword,
			password,
		);
		if (!isPasswordValid) return;

		if (password !== confirm) {
			reset();
			notification('Passwords do not match!');
			toast();
			return;
		}


		const taskRegister = await kbve.registerUser(
			domain,
			username,
			email,
			password,
			captchaToken,
		);

		if (taskRegister.error) {
			reset();
			notification(taskRegister.scope());
			toast();
			return;
		}
		else {
			notification('Registeration was successful!');
			toast();
		}

		console.log('Register task EoL');
	};

	// Reactive statement: Updates when 'mounted' and 'loaded' state changes.
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
		skeleton = window.document.getElementById('skeleton') as HTMLElement; // Removing the skeleton element, if it exists.
		if (skeleton) skeleton.remove();
	}

	// Initializing form-related variables with regular expression, states, and values.
	let loading = false; // State variable for tracking loading status.
	let username = ''; // Variable for storing username input.
	let email = ''; // Variable for storing email input.
	let confirm = ''; // Variable for storing confirm input.
	let password = ''; // Variable for storing password input.
	let captchaToken = ''; // Variable for storing the captcha token.
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

<section class={className}>
	<form
		class="space-y-4 md:space-y-6"
		action="#"
		on:submit|preventDefault={handleRegister}>
		<div>
			<label for="email" class="block mb-2 text-sm font-medium">
				Your email
			</label>
			<input
				type="email"
				name="email"
				id="email"
				class="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5"
				placeholder="name@company.com"
				required
				bind:value={email} />
		</div>
		<div>
			<label for="username" class="block mb-2 text-sm font-medium">
				Your Username
			</label>
			<input
				type="text"
				name="username"
				id="username"
				class="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5"
				placeholder="Username-chan"
				required
				bind:value={username} />
		</div>
		<div>
			<label for="password" class="block mb-2 text-sm font-medium">
				Password
			</label>
			<input
				type="password"
				name="password"
				id="password"
				placeholder="••••••••"
				class="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5"
				required
				bind:value={password} />
		</div>
		<div>
			<label for="password" class="block mb-2 text-sm font-medium">
				Confirm Password
			</label>
			<input
				type="password"
				name="confirm"
				id="confirm"
				placeholder="••••••••"
				class="bg-gray-50 border border-gray-300 text-gray-900 sm:text-sm rounded-lg focus:ring-primary-600 focus:border-primary-600 block w-full p-2.5"
				required
				bind:value={confirm} />
		</div>
		<div id="h-captcha-{id}" class="flex justify-center" />
		<div class="flex items-center justify-between">
			<div class="flex items-start" />
			<a
				href="/account/recovery"
				class="text-sm font-medium text-kbve-primary-light hover:underline">
				Forgot password?
			</a>
		</div>
		<button
			type="submit"
			class="w-full bg-offset/[.75] hover:bg-offset focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
			disabled={loading}>
			<span>{loading ? 'Loading' : 'Register'}</span>
		</button>
		<p class="text-sm font-light">
			Have an account yet? <a
				href="/account/login"
				class="font-medium hover:underline">
				Login!
			</a>
		</p>
	</form>
</section>
