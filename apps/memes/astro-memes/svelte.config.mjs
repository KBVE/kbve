import { vitePreprocess } from '@astrojs/svelte';
//import { sveltePreprocess } from 'svelte-preprocess';


export default {
	extensions: ['.svelte'],
	preprocess: [vitePreprocess({ script: true })]
}