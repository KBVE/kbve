import rehypeExternalLinks from 'rehype-external-links';
import { rehypeHeadingIds } from '@astrojs/markdown-remark';

export default {
	extendMarkdownConfig: true,
	rehypePlugins: [
		rehypeHeadingIds,
		[
			rehypeExternalLinks,
			{
				rel: ['nofollow', 'noopener', 'noreferrer'],
				target: ['_blank'],
			},
		],
		//! rehypeSlug errors
	],

	//? Shiki Configuration

	shikiConfig: {
		// https://github.com/shikijs/shiki/blob/main/docs/themes.md
		theme: 'dracula',
		// https://github.com/shikijs/shiki/blob/main/docs/languages.md
		langs: [],
		wrap: true,
	},

	//? External Plugins -> True
	extendPlugins: true,
	gfm: true,
	remarkPlugins: [],
};
