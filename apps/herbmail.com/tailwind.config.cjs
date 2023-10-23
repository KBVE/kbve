const {
  createGlobPatternsForDependencies,
} = require('@nxtensions/astro/tailwind');
const { join } = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    join(
      __dirname,
      'src/**/!(*.stories|*.spec).{astro,html,js,jsx,md,svelte,ts,tsx,vue}'
    ),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    extend: {
      colors: {
        // Color extension is prefixed as KBVE to avoid class conflicts
        'kbve': {
          DEFAULT: '#8C52FF',
        },
        'kbve-primary': { 
          DEFAULT: "#48BB78",
        },
        'kbve-secondary': { 
          DEFAULT: "#1c033c",
        },
      },
      backgroundColor: {
        default: "var(--color-background)",
        //offset: "var(--color-background-offset)",
        offset: "#23262d",
      },

      keyframes: {
        float: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, 30px, 0)' },
        },
        'ltr-linear-infinite': {
          '0%, 100%': { 'background-position': '0 0' },
          '50%': { 'background-position': '400% 0%' },
        },
       
      },
    },
  },
 
};
