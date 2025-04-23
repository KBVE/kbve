<script lang="ts">
	// import { Icon } from '@astrojs/starlight/components';
	import { panelManager } from 'src/layout/scripts/nanostores';

	// Icon typing — infer from Icon component
	type IconName =
		| 'starlight'
		| 'laptop'
		| 'open-book'
		| 'setting'
		| 'information'
		| 'logout';

	type NavRoute = {
		href: string;
		label: string;
		icon: IconName;
	};

	const navRoutes: NavRoute[] = [
		{ href: '/', label: 'Dashboard', icon: 'starlight' },
		{ href: '/servers', label: 'Servers', icon: 'laptop' },
		{ href: '/logs', label: 'Logs', icon: 'open-book' },
		{ href: '/settings', label: 'Settings', icon: 'setting' },
	];

	const footerRoutes: NavRoute[] = [
		{ href: '/logout', label: 'Logout', icon: 'logout' },
	];

	const navLinkClass =
		'relative flex items-center gap-2 rounded px-3 py-2 transition hover:animate-pulse overflow-hidden group';
	const iconClass = 'w-5 h-5 text-purple-400 shrink-0';
	const pathClass = '';

	const icons: Record<IconName, string> = {
		starlight: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="${iconClass}"><path class="${pathClass}" stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>`,
		laptop: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M2 20h20"/><path d="m9 10 2 2 4-4"/><rect x="3" y="4" width="18" height="12" rx="2"/></svg>`,
		'open-book': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M10 2v8l3-3 3 3V2"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/></svg>`,
		setting: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
		information: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
		logout: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${iconClass}"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
	};

	const safeIcon = (name: IconName) => icons[name] ?? '';
</script>

<aside class="w-full h-full flex flex-col p-3 bg-gray-800 text-white">
	<!-- Header -->
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-lg font-bold">DiscordSH</h1>
		<button
			class="text-purple-400 hover:text-white"
			on:click={() => panelManager.get().closePanel('left')}
			aria-label="Close sidebar">
			<!-- <Icon name="close" /> -->
		</button>
	</div>

	<!-- Navigation -->
	<nav class="flex flex-col gap-3">
		{#each navRoutes as { href, label, icon }}
			<a {href} aria-label={label} class={navLinkClass}>
				<!-- Swipe highlight -->
				<span
					class="pointer-events-none absolute inset-0 w-full h-full bg-white opacity-5 rotate-12 transform translate-x-full transition-transform duration-1000 ease-in-out group-hover:-translate-x-full"
					aria-hidden="true">
				</span>
						
				<!-- Icon -->
				<span
					class="text-lg text-purple-400 relative z-10"
					aria-hidden="true">
					{@html safeIcon(icon)}
				</span>

				<!-- Label -->
				<span class="relative z-10">{label}</span>
			</a>
		{/each}
	</nav>

	<hr class="h-px my-8 bg-gray-200 border-0 dark:bg-purple-400">

	<!-- Footer -->
	<div class="mt-auto pt-6 border-t border-gray-700">
		{#each footerRoutes as { href, label, icon }}
			<a
				{href}
				aria-label={label}
				class={`${navLinkClass} text-sm text-gray-400 hover:text-purple-300`}>
				<!-- <Icon name={icon} /> -->
				{@html safeIcon(icon)}
				{label}
			</a>
		{/each}
	</div>
</aside>
