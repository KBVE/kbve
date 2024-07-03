const {
  createGlobPatternsForDependencies,
} = require('@nxtensions/astro/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(
      __dirname,
      'src/**/!(*.stories|*.spec).{astro,html,js,jsx,md,svelte,ts,tsx,vue}',
    ),
    ...createGlobPatternsForDependencies(__dirname),
		join(__dirname, '../../node_modules/preline/dist/*.js'),
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('preline/plugin')
  ],
};
