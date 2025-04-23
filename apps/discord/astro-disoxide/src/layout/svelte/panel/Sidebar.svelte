<script lang="ts">
	// import { Icon } from '@astrojs/starlight/components';
	import { panelManager } from 'src/layout/scripts/nanostores';
	const navLinkClass =
		'flex items-center gap-2 rounded px-3 py-2 hover:bg-gray-700 transition';

	// Icon typing — infer from Icon component
	type IconName =
		| 'starlight'
		| 'laptop'
		| 'open-book'
		| 'setting'
		| 'information';

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
		{ href: '/logout', label: 'Logout', icon: 'information' },
	];

    const iconClass = 'w-5 h-5 text-purple-400 shrink-0';


	const icons: Record<IconName, string> = {
		starlight: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="${iconClass}"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>`,
		laptop: `<svg ...>...</svg>`,
		'open-book': `<svg ...>...</svg>`,
		setting: `<svg ...>...</svg>`,
		information: `<svg ...>...</svg>`,
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
				<!-- <Icon name={icon} /> -->
				{label}
			</a>
		{/each}
	</nav>

	<!-- Footer -->
	<div class="mt-auto pt-6 border-t border-gray-700">
		{#each footerRoutes as { href, label, icon }}
			<a
				{href}
				aria-label={label}
				class={`${navLinkClass} text-sm text-gray-400 hover:text-purple-300`}>
				<!-- <Icon name={icon} /> -->
				{label}
			</a>
		{/each}
	</div>
</aside>
