import { sveltePreprocess } from 'svelte-preprocess';

/** @type {import('svelte/compiler').SvelteConfig} */
const config = {
	preprocess: sveltePreprocess(),
};

export default config;