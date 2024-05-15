// Shiki Helper

import * as shiki from 'shiki';

export const getHighlightedCode = async (code) => {
    const highlighter = await shiki.getHighlighter({
        theme: 'nord',
    });

    await highlighter.loadTheme('nord');
    await highlighter.loadLanguage('html'); 

    return highlighter.codeToHtml(code, {lang: 'html', theme: 'nord'});
}