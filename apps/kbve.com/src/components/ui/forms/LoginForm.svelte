<script>
	import { onMount } from 'svelte';

	import { locker, kbve$, loginUser } from '@kbve/khashvault';

	onMount(() => {
		const loader = document.getElementById('skeleton_login_loader');
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
	});
</script>

<div class="mt-5">
	<!-- Buttons for Google Sign in -->
	<div class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
		Welcome
	</div>

	<div
		class="flex items-center py-3 text-xs uppercase text-neutral-400 before:me-6 before:flex-[1_1_0%] before:border-t before:border-neutral-200 after:ms-6 after:flex-[1_1_0%] after:border-t after:border-neutral-200 dark:text-neutral-500 dark:before:border-neutral-600 dark:after:border-neutral-600">
		Or
	</div>

	<form id="loginForm">
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
						aria-describedby="login-email" />
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

					<button
						class="rounded-lg text-sm font-medium text-cyan-400 decoration-2 outline-none ring-zinc-500 hover:underline focus-visible:ring dark:text-cyan-400 dark:ring-zinc-200 dark:focus:outline-none dark:focus:ring-1"
						data-hs-overlay="#hs-toggle-between-modals-recover-modal">
						Forgot password?
					</button>
				</div>
				<div class="relative">
					<input
						type="password"
						id="login-password"
						name="password"
						class="block w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700 focus:border-neutral-200 focus:outline-none focus:ring focus:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-700/30 dark:text-neutral-300 dark:focus:ring-1"
						required
						aria-describedby="login-password" />
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
		</div>
	</form>
</div>
