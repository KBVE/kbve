/// <reference path=".astro/types.d.ts" />
/// <reference types="astro/client" />

declare module 'virtual:starlight/components/MobileMenuFooter' {
	const MobileMenuFooter: typeof import('@astrojs/starlight/components/MobileMenuFooter.astro').default;
	export default MobileMenuFooter;
}
