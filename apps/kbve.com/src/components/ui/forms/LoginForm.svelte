<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { locker, kbve$, loginUser, profileWithToken, sleep } from '@kbve/khashvault';

	const dispatch = createEventDispatcher();

	export const reset = () => {
		loading = false;
		successful_message = '';
	};

	// UX
	let mounted = false;
	let loading = false;
	let lottie_player_file = '';

	let errorMessageAstro: any;

	// UI
	let email = '';
	let password = '';
	let svelte_internal_message = '';
	let successful_message = '';

	// Styles from ScrewFast
	const baseClasses =
		'inline-flex w-full items-center justify-center gap-x-2 rounded-lg px-4 py-3 text-sm font-bold text-neutral-700 focus-visible:ring outline-none transition duration-300';
	const borderClasses = 'border border-transparent';
	const bgColorClasses = 'bg-yellow-400 dark:focus:outline-none';
	const hoverClasses = 'hover:bg-yellow-500';
	const fontSizeClasses = '2xl:text-base';
	const disabledClasses = 'disabled:pointer-events-none disabled:opacity-50';
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
		dispatch('mount');
		mounted = true;
	});

	const handleLogin = async () => {
		loading = true;
		svelte_internal_message = '';

		const taskLogin = await loginUser(
			'https://rust.kbve.com',
			email,
			password,
		);

		if (taskLogin.error) {
			//taskLogin.display();
			switch (taskLogin.extractError()) {
				case 'invalid_password':
					svelte_internal_message = 'Invalid Password';
					lottie_player_file = 'pray.lottie';
					break;
				case 'auth_error':
					svelte_internal_message = 'Invalid Auth Method';
					lottie_player_file = 'monkeymeme.lottie';
					break;
				default:
					svelte_internal_message = taskLogin.extractError();
			}
			reset();
		} else {
			taskLogin.display();
			svelte_internal_message = '';
			lottie_player_file = 'holydance.lottie';
			successful_message =
				'Yay! SucklessFully Dance, while I get dat profile!';
			//console.log(taskLogin.token());
			await sleep(500);
			const taskProfile = await profileWithToken('https://rust.kbve.com', taskLogin.token());

			if (taskProfile.error) {
				switch (taskProfile.extractError()) {
					default:
						svelte_internal_message = taskProfile.extractError();
						reset();
				}
			}
			else 
			{
				locker('username', taskProfile.extractField('username'));
				locker('email', taskProfile.extractField('email'));
				locker('uuid', taskProfile.extractField('userid'));
				location.href = '/dashboard';
			}
		}

	};
</script>

	{#if $kbve$.username}
	<div class="object-contain">
	<a href="/dashboard/">
	<button class="relative rounded px-5 py-2.5 overflow-hidden group bg-cyan-500 relative hover:bg-gradient-to-r hover:from-cyan-500 hover:to-cyan-400 text-white hover:ring-2 hover:ring-offset-2 hover:ring-cyan-400 transition-all ease-out duration-300">
		<span class="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease"></span>
		<span class="relative">	{$kbve$.username} Enter The Dashboard</span>
	</button>
	</a>
	</div>

	{/if}

<div class="mt-5">
	<!-- Buttons for Google Sign in -->
	<div class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
		Welcome to KBVE Auth Portal!
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

	<form id="loginForm" action="#" on:submit|preventDefault={handleLogin}>
		<div class="grid gap-y-4">
			<!-- Email - START -->

			<div>
				<!-- Label for the email input field -->
				<label
					for="login-email"
					class="mb-2 block text-sm text-neutral-800 dark:text-neutral-200">
					Email Address
				</label>
				<!-- Label for the email input field -->
				<div class="relative">
					<!-- Email input field -->
					<input
						type="email"
						id="login-email"
						name="email"
						autocomplete="email"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="login-email"
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
					id="login-email-error">
					Please include a valid email address so we can get back to
					you
				</p>
			</div>

			<!-- Email - END -->

			<!-- PASS - START -->

			<div>
				<div class="flex items-center justify-between">
					<label
						for="login-password"
						class="mb-2 block text-sm text-neutral-800 dark:text-neutral-200">
						Password
					</label>

					<a href="/recover/" target="/recover/">

					<span
						class="rounded-lg text-sm font-medium text-cyan-400 decoration-2 outline-none ring-zinc-500 hover:underline focus-visible:ring dark:text-cyan-400 dark:ring-zinc-200 dark:focus:outline-none dark:focus:ring-1"
					>
					Forgot password?
					</span>
					</a>
				</div>
				<div class="relative">
					<input
						type="password"
						id="login-password"
						name="password"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="login-password"
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
					id="login-password-error">
					8+ characters required
				</p>
			</div>

			<!-- PASS - END -->

			<!-- Additional Options -->

			<!-- Button -->
			<button
				type="submit"
				class={`${baseClasses} ${borderClasses} ${bgColorClasses} ${hoverClasses} ${fontSizeClasses} ${disabledClasses} ${ringClasses}`}
				disabled={loading}>
				{loading ? 'Loading...' : 'Sign In'}
			</button>
		</div>
	</form>
</div>
