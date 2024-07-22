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

    declare var hcaptcha: any; 	// Declaring a global variable 'hcaptcha'. This is used to interact with the hCaptcha API.

    export enum CaptchaTheme {
		DARK = 'dark', // Represents the dark theme.
		LIGHT = 'light', // Represents the light theme.
	}

</script>

<script lang="ts">
   	import { onMount, onDestroy, createEventDispatcher } from 'svelte';

       import * as Vault from '@kbve/khashvault';


    let mounted = false;
    export let reCaptchaCompat: boolean = true; // Exporting 'reCaptchaCompat', initially set to false.


    const query = new URLSearchParams({
		recaptchacompat: reCaptchaCompat ? 'on' : 'off', // Setting recaptcha compatibility mode.
		onload: 'hcaptchaOnLoad', // Onload callback name.
		render: 'explicit', // Rendering mode.
	});

    export let sitekey: string = Vault.hcaptcha_site_key; // Exporting 'sitekey', initially set from 'kbve' module.
	export let apihost: string = Vault.hcaptcha_api;
    const scriptSrc = `${apihost}?${query.toString()}`; // Constructing the full script source URL.

</script>


<svelte:head>
	{#if mounted && !window?.hcaptcha}
		<script src={scriptSrc} async defer></script>
	{/if}
</svelte:head>
