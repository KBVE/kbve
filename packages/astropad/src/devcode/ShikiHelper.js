import * as shiki from 'shiki';

export const getHighlightedCode = async (code) => {
	const highlighter = await shiki.getHighlighter({
		theme: 'nord',
	});

	await highlighter.loadTheme('nord');
	await highlighter.loadLanguage('html');

	const html = highlighter.codeToHtml(code, {
		lang: 'html',
		theme: 'nord',
		lineOptions: [{ lineNumber: true }, { wrap: true }],
	});

	return html;
};
