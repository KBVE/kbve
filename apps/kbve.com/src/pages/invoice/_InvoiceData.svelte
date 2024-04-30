<script>
	import { ulidinvoicestore } from './_InvoiceStore';
	import { onMount } from 'svelte';

	let invoiceNumber = 'Loading...'; // Default or placeholder text

	ulidinvoicestore.subscribe((value) => {
		invoiceNumber = value || 'Not available'; // Fallback if no ULID is found
	});

	onMount(() => {
		const loader = document.getElementById('skeleton_invoice_loader');
		if (loader) {
			// Apply Tailwind classes for fade-out
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

	// Simulate importing JSON data
	let items = [
		{ item: 'Design UX and UI', qty: 1, rate: 5, amount: 500 },
		{ item: 'Web project', qty: 1, rate: 24, amount: 1250 },
		{ item: 'SEO', qty: 1, rate: 6, amount: 2000 },
        { item: 'Tutorial', qty: 1, rate: 1, amount: 4000},
	];

    let _subtotal = items.reduce((total, item) => total + item.amount, 0);
    let subtotal = _subtotal.toFixed(2);
    let _fees = (_subtotal * 0.108);
    let fees = _fees.toFixed(2);

    let _total = _subtotal + _fees;
    let total = _total.toFixed(2);

    let _paid = 694.20;
    let paid = _paid.toFixed(2);

    let _due = _total - _paid;
    let due = _due.toFixed(2);

    let _invoice = '';

</script>

<!-- Invoice -->
<div class="max-w-[85rem] px-4 sm:px-6 lg:px-8 mx-auto my-4 sm:my-10">
	<div class="sm:w-11/12 lg:w-3/4 mx-auto">
		<!-- Card -->
		<div
			class="flex flex-col p-4 sm:p-10 bg-white shadow-md rounded-xl dark:bg-neutral-800">
			<!-- Grid -->
			<div class="flex justify-between">
				<div class="text-gray-800 dark:text-neutral-200">
					<svg
						class="size-20"
						width="50"
						height="50"
						viewBox="0 0 76 76"
						xmlns="http://www.w3.org/2000/svg"
						xmlns:xlink="http://www.w3.org/1999/xlink"
						version="1.1"
						baseProfile="full"
						enable-background="new 0 0 76.00 76.00"
						xml:space="preserve"
						fill="currentColor">
						<g id="SVGRepo_bgCarrier" stroke-width="0"></g>
						<g
							id="SVGRepo_tracerCarrier"
							stroke-linecap="round"
							stroke-linejoin="round">
						</g>
						<g id="SVGRepo_iconCarrier">
							<path
								fill="currentColor"
								fill-opacity="1"
								stroke-linejoin="round"
								d="M 30.351,23.3949L 38.0169,19L 45.679,23.4244C 45.3991,23.8942 45.1188,24.364 44.8338,24.8309L 38.013,20.9065C 35.7412,22.216 33.4687,23.5251 31.1941,24.8298L 30.351,23.3949 Z M 33.2788,25.9482L 37.982,23.0164L 42.691,25.9458L 42.2196,26.6994L 39.8535,25.331C 39.6,27.7058 39.3291,30.0798 39.0822,32.4544C 40.1354,33.0708 41.1944,33.6778 42.2507,34.2898L 48.0344,30.0592L 45.6707,28.6901C 45.8087,28.4294 45.94,28.1645 46.0811,27.9054C 47.7098,28.7809 49.3427,29.6484 50.9705,30.5251L 50.7839,36.0726L 49.9052,36.0392L 49.9052,33.3032L 43.3427,36.1976L 43.3427,39.8346L 49.9048,42.7275L 49.9048,39.9911L 50.7831,39.96C 50.8475,41.8096 50.9116,43.6596 50.9689,45.5096L 46.0788,48.1261C 45.9443,47.863 45.8039,47.6029 45.6719,47.3387C 46.4612,46.8858 47.2471,46.4274 48.0348,45.9718L 42.2196,41.7106L 39.0465,43.546L 39.8539,50.7001L 42.2204,49.3321L 42.691,50.0841L 38.0169,53.0139L 33.2784,50.0833L 33.7506,49.3309L 36.1458,50.7001L 36.9194,43.5436C 36.9331,43.5062 36.8891,43.4977 36.8674,43.4819L 33.7804,41.7106L 27.9651,45.9722L 30.3294,47.3717L 29.8902,48.156C 28.269,47.2844 26.6475,46.4137 25.0295,45.5366C 25.0805,43.6875 25.1305,41.8383 25.1859,39.9891L 26.0897,40.0217L 26.0897,42.7617L 32.6574,39.8645L 32.6569,36.1976L 26.0897,33.3016L 26.0897,36.04L 25.1859,36.0726C 25.132,34.2329 25.0774,32.3923 25.031,30.5526L 29.8887,27.9062L 30.3294,28.6901L 27.9644,30.0592L 33.7187,34.2895C 34.7848,33.6775 35.8544,33.0708 36.9174,32.4544C 36.6705,30.0798 36.3997,27.7058 36.1461,25.331L 33.7501,26.699C 33.5897,26.4505 33.4361,26.1982 33.2788,25.9482 Z M 21.5461,28.4939C 24.0993,27.0241 26.6506,25.5504 29.2007,24.075C 29.4893,24.5401 29.7676,25.0122 30.0455,25.4835L 23.1948,29.4385L 23.194,37.3156L 21.5438,37.316C 21.5454,34.3752 21.5411,31.4343 21.5461,28.4939 Z M 45.9829,25.5137L 46.8257,24.0753C 49.3698,25.5464 51.9089,27.0253 54.4538,28.4939C 54.459,31.4343 54.4547,34.3752 54.4563,37.316L 52.8059,37.3156L 52.8052,29.4385L 45.9829,25.5137 Z M 21.5438,38.653L 23.1944,38.653L 23.1944,46.5233C 25.5385,47.898 28.0139,49.3129 30.0475,50.4855L 29.2066,51.923C 26.6502,50.456 24.1017,48.974 21.5457,47.5053C 21.5414,44.5546 21.5446,41.604 21.5438,38.653 Z M 52.8055,38.653L 54.4559,38.653C 54.4551,41.604 54.459,44.555 54.4539,47.5057C 51.9089,48.9747 49.3699,50.4537 46.8257,51.9246L 45.9829,50.4863C 48.2554,49.1638 50.5381,47.8532 52.804,46.5233L 52.8055,38.653 Z M 30.3513,52.5757L 31.1953,51.1377L 38.013,55.093L 44.8349,51.1377L 45.679,52.5757L 38.0169,57L 30.3513,52.5757 Z ">
							</path>
						</g>
					</svg>

					<h1
						class="mt-2 text-lg md:text-xl font-semibold text-cyan-600 dark:text-white">
						KBVE LLC.
					</h1>
				</div>
				<!-- Col -->

				<div class="text-end">
					<h2
						class="text-2xl md:text-3xl font-semibold text-gray-800 dark:text-neutral-200">
						Invoice #
					</h2>
					<span
						class="mt-1 block text-gray-500 dark:text-neutral-500">
						{invoiceNumber}
					</span>

					<address
						class="mt-4 not-italic text-gray-800 dark:text-neutral-200">
						KBVE.com
						<br />
						NYC
						<br />
						United States
						<br />
					</address>
				</div>
				<!-- Col -->
			</div>
			<!-- End Grid -->

			<!-- Grid -->
			<div class="mt-8 grid sm:grid-cols-2 gap-3">
				<div>
					<h3
						class="text-lg font-semibold text-gray-800 dark:text-neutral-200">
						Bill to:
					</h3>
					<h3
						class="text-lg font-semibold text-gray-800 dark:text-neutral-200">
						Sara Williams
					</h3>
					<address
						class="mt-2 not-italic text-gray-500 dark:text-neutral-500">
						280 Suzanne Throughway,
						<br />
						Breannabury, OR 45801,
						<br />
						United States
						<br />
					</address>
				</div>
				<!-- Col -->

				<div class="sm:text-end space-y-2">
					<!-- Grid -->
					<div class="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-2">
						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Invoice date:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
								03/10/2018
							</dd>
						</dl>
						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Due date:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
								03/11/2018
							</dd>
						</dl>
					</div>
					<!-- End Grid -->
				</div>
				<!-- Col -->
			</div>
			<!-- End Grid -->

			<!-- Table -->

			<div class="mt-6">
				<div
					class="border border-gray-200 p-4 rounded-lg space-y-4 dark:border-neutral-700">
					<div class="hidden sm:grid sm:grid-cols-5">
						<div
							class="sm:col-span-2 text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
							Item
						</div>
						<div
							class="text-start text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
							Qty
						</div>
						<div
							class="text-start text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
							Rate
						</div>
						<div
							class="text-end text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
							Amount
						</div>
					</div>

					<div
						class="hidden sm:block border-b border-gray-200 dark:border-neutral-700">
					</div>

					{#each items as { item, qty, rate, amount }}
						<div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
							<div class="col-span-full sm:col-span-2">
								<h5
									class="sm:hidden text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
									Item
								</h5>
								<p
									class="font-medium text-gray-800 dark:text-neutral-200">
									{item}
								</p>
							</div>
							<div>
								<h5
									class="sm:hidden text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
									Qty
								</h5>
								<p class="text-gray-800 dark:text-neutral-200">
									{qty}
								</p>
							</div>
							<div>
								<h5
									class="sm:hidden text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
									Rate
								</h5>
								<p class="text-gray-800 dark:text-neutral-200">
									{rate}
								</p>
							</div>
							<div>
								<h5
									class="sm:hidden text-xs font-medium text-gray-500 uppercase dark:text-neutral-500">
									Amount
								</h5>
								<p
									class="sm:text-end text-gray-800 dark:text-neutral-200">
									${amount}
								</p>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- End Table -->

			<!-- Flex -->
			<div class="mt-8 flex sm:justify-end">
				<div class="w-full max-w-2xl sm:text-end space-y-2">
					<!-- Grid -->
					<div class="grid grid-cols-2 sm:grid-cols-1 gap-3 sm:gap-2">
						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Subtotal:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
                                ${subtotal}
							</dd>
						</dl>

						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Tax, Fees & Service:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
								${fees}
							</dd>
						</dl>

                        
						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Total:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
								${total}
							</dd>
						</dl>


						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Amount paid:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
								${paid}
							</dd>
						</dl>

						<dl class="grid sm:grid-cols-5 gap-x-3">
							<dt
								class="col-span-3 font-semibold text-gray-800 dark:text-neutral-200">
								Due balance:
							</dt>
							<dd
								class="col-span-2 text-gray-500 dark:text-neutral-500">
								${due}
							</dd>
						</dl>
					</div>
					<!-- End Grid -->
				</div>
			</div>
			<!-- End Flex -->

			<div class="mt-8 sm:mt-12">
				<h4
					class="text-lg font-semibold text-gray-800 dark:text-neutral-200">
					Thank you!
				</h4>
				<p class="text-gray-500 dark:text-neutral-500">
					If you have any questions concerning this invoice, use the
					following contact information:
				</p>
				<div class="mt-2">
					<p
						class="block text-sm font-medium text-gray-800 dark:text-neutral-200">
						example@site.com
					</p>
					<p
						class="block text-sm font-medium text-gray-800 dark:text-neutral-200">
						+1 (062) 109-9222
					</p>
				</div>
			</div>

			<p class="mt-5 text-sm text-gray-500 dark:text-neutral-500">
				© 2024 KBVE.com
			</p>
		</div>
		<!-- End Card -->

		<!-- Buttons -->
		<div class="mt-6 flex justify-end gap-x-3">
			<a
				class="py-2 px-3 inline-flex justify-center items-center gap-2 rounded-lg border font-medium bg-white text-gray-700 shadow-sm align-middle hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-cyan-600 transition-all text-sm dark:bg-neutral-800 dark:hover:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-white dark:focus:ring-offset-gray-800"
				href="/#">
				<svg
					class="flex-shrink-0 size-4"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
					<polyline points="7 10 12 15 17 10"></polyline>
					<line x1="12" x2="12" y1="15" y2="3"></line>
				</svg>
				Invoice PDF
			</a>
			<a
				class="py-2 px-3 inline-flex items-center gap-x-2 text-sm font-semibold rounded-lg border border-transparent bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50 disabled:pointer-events-none"
				href="/#">
				<svg
					class="flex-shrink-0 size-4"
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round">
					<polyline points="6 9 6 2 18 2 18 9"></polyline>
					<path
						d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2">
					</path>
					<rect width="12" height="8" x="6" y="14"></rect>
				</svg>
				Print
			</a>
		</div>
		<!-- End Buttons -->
	</div>
</div>
<!-- End Invoice -->
