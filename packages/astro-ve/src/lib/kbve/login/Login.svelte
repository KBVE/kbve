<script lang="ts" context="module">
	declare global {
		interface Window {
			react: any;
		}
	}

	declare var Toastify: any;
	declare var react: any;
</script>

<script lang="ts">
	import { task } from 'nanostores';

	//  [IMPORTS]
	// Importing required modules and functions from relative paths and Svelte.
	import * as kbve from '../../kbve'; // Importing custom module 'kbve'.
	import { notification, toast$ } from '../../storage'; // Importing custom module 'storage'.

	import { onMount, onDestroy, createEventDispatcher } from 'svelte'; // Importing Svelte lifecycle and event functions.

	// Determining if the current environment is a browser or server-side rendering (SSR).
	const browser =
		import.meta.env.SSR === undefined ? true : !import.meta.env.SSR;

	//  Creating an event dispatcher to handle custom events.
	const dispatch = createEventDispatcher();

	export const reset = () => {
        loading = false;
    };

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

	//  Exporting variables
	export let domain: string = ''; // Exporting 'domain' , this will be used to build the endpoint.
	export let className: string = '';

	// Initializing internal state variables.
	let mounted = false; // Indicates if component is mounted.
	let loaded = false; // Indicates if captcha is loaded.
	let skeleton: any; // Reference to a skeleton or placeholder element.

	// Lifecycles

	onMount(() => {
		if (browser) {
			dispatch('load');
			loaded = true;
		}
		dispatch('mount');
		mounted = true;
	});

	onDestroy(() => {});

	$: if (mounted && loaded) {
		skeleton = window.document.getElementById('skeleton') as HTMLElement; // Removing the skeleton element, if it exists.
		if (skeleton) skeleton.remove();
	}

	//  Interface

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

	//  TODO: Login Script

	const handleLogin = async () => {
		loading = true;

		const isEmailValid = await validateField(kbve.checkEmail, email);
		if (!isEmailValid) return;

        const isPasswordValid = await validateField(
			kbve.checkPassword,
			password,
		);
		if (!isPasswordValid) return;

		const taskLogin = await kbve.loginUser(
            domain,
            email,
            password
        );

        if(taskLogin.error) {
            reset();
            notification(taskLogin.scope());
            toast();
            return;
        }
        else {
            notification('Login was successful!');
            toast();
            loading = false;
        }

		loading = false;
	};

	let loading = false;
	let email = '';
	let password = '';
</script>

<section class={className}>
	<form
		class="space-y-4 md:space-y-6"
		action="#"
		on:submit|preventDefault={handleLogin}>
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

		<button
			type="submit"
			class="w-full bg-offset/[.75] hover:bg-offset focus:ring-4 focus:outline-none focus:ring-primary-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
			disabled={loading}>
			<span>{loading ? 'Loading' : 'Login'}</span>
		</button>
	</form>
</section>
