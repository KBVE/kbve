// Starlight resolves `virtual:starlight/*` through a Vite plugin and ships no
// declarations for it. Sites that override Header.astro import those modules
// directly, so every one of them needs the shapes declared somewhere.
//
// Five sites used to reference @astrojs/starlight/virtual.d.ts and
// virtual-internal.d.ts inside node_modules. Starlight 0.42 does not contain
// either file -- a `/// <reference path>` at a missing file is silent, so the
// overrides had been untyped since the upgrade and `astro check` reported
// ts(2307) on all of them. Nothing ran `astro check`, so nobody saw it.
//
// Typed against the real components rather than `any`, so a prop that Starlight
// renames still breaks the override that passes it.

declare module 'virtual:starlight/user-config' {
	const config: import('@astrojs/starlight/types').StarlightConfig;
	export default config;
}

declare module 'virtual:starlight/components/Search' {
	const Search: typeof import('@astrojs/starlight/components/Search.astro').default;
	export default Search;
}

declare module 'virtual:starlight/components/SiteTitle' {
	const SiteTitle: typeof import('@astrojs/starlight/components/SiteTitle.astro').default;
	export default SiteTitle;
}

declare module 'virtual:starlight/components/SocialIcons' {
	const SocialIcons: typeof import('@astrojs/starlight/components/SocialIcons.astro').default;
	export default SocialIcons;
}

declare module 'virtual:starlight/components/ThemeSelect' {
	const ThemeSelect: typeof import('@astrojs/starlight/components/ThemeSelect.astro').default;
	export default ThemeSelect;
}

declare module 'virtual:starlight/components/LanguageSelect' {
	const LanguageSelect: typeof import('@astrojs/starlight/components/LanguageSelect.astro').default;
	export default LanguageSelect;
}

declare module 'virtual:starlight/components/MobileMenuFooter' {
	const MobileMenuFooter: typeof import('@astrojs/starlight/components/MobileMenuFooter.astro').default;
	export default MobileMenuFooter;
}
