// The React layer, for the five projects that had @nx/eslint-plugin's flat/react.
//
// The rule table is that preset's, verbatim. It is not any plugin's
// `recommended` set -- it is create-react-app's list, which @nx/eslint-plugin
// carried, and it differs from the recommended sets in ways that matter: nearly
// everything is a warning, and rules such as jsx-a11y/click-events-have-key-events
// are absent entirely. Swapping in the recommended sets instead turned 35 warnings
// into errors across desktop-kbve alone, none of them a new problem.
//
// So it is written out rather than composed. Every plugin it needs was already a
// dependency; only the config that selected these rules came from Nx.
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const files = [
	'**/*.ts',
	'**/*.cts',
	'**/*.mts',
	'**/*.tsx',
	'**/*.js',
	'**/*.cjs',
	'**/*.mjs',
	'**/*.jsx',
];

export default [
	{
		files,
		plugins: {
			// The table carries a handful of @typescript-eslint rules and applies
			// them to .js as well, which is what the preset did.
			'@typescript-eslint': tseslint.plugin,
			import: importPlugin,
			react,
			'react-hooks': reactHooks,
			'jsx-a11y': jsxA11y,
		},
		settings: { react: { version: 'detect' } },
		languageOptions: {
			parserOptions: { ecmaFeatures: { jsx: true } },
		},
		rules: {
			"@typescript-eslint/no-array-constructor": "warn",
			"@typescript-eslint/no-namespace": "error",
			"@typescript-eslint/no-unused-expressions": [
				"error",
				{
					"allowShortCircuit": true,
					"allowTernary": true,
					"allowTaggedTemplates": true
				}
			],
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					"args": "none",
					"ignoreRestSiblings": true
				}
			],
			"@typescript-eslint/no-use-before-define": [
				"warn",
				{
					"functions": false,
					"classes": false,
					"variables": false,
					"typedefs": false
				}
			],
			"@typescript-eslint/no-useless-constructor": "warn",
			"array-callback-return": "warn",
			"default-case": "off",
			"dot-location": [
				"warn",
				"property"
			],
			"eqeqeq": [
				"warn",
				"smart"
			],
			"getter-return": "warn",
			"import/first": "error",
			"import/no-amd": "error",
			"import/no-webpack-loader-syntax": "error",
			"jsx-a11y/accessible-emoji": "warn",
			"jsx-a11y/alt-text": "warn",
			"jsx-a11y/anchor-has-content": "warn",
			"jsx-a11y/anchor-is-valid": [
				"warn",
				{
					"aspects": [
						"noHref",
						"invalidHref"
					]
				}
			],
			"jsx-a11y/aria-activedescendant-has-tabindex": "warn",
			"jsx-a11y/aria-props": "warn",
			"jsx-a11y/aria-proptypes": "warn",
			"jsx-a11y/aria-role": "warn",
			"jsx-a11y/aria-unsupported-elements": "warn",
			"jsx-a11y/heading-has-content": "warn",
			"jsx-a11y/iframe-has-title": "warn",
			"jsx-a11y/img-redundant-alt": "warn",
			"jsx-a11y/no-access-key": "warn",
			"jsx-a11y/no-distracting-elements": "warn",
			"jsx-a11y/no-redundant-roles": "warn",
			"jsx-a11y/role-has-required-aria-props": "warn",
			"jsx-a11y/role-supports-aria-props": "warn",
			"jsx-a11y/scope": "warn",
			"new-parens": "warn",
			"no-array-constructor": "off",
			"no-caller": "warn",
			"no-cond-assign": [
				"warn",
				"except-parens"
			],
			"no-const-assign": "warn",
			"no-control-regex": "warn",
			"no-delete-var": "warn",
			"no-dupe-args": "warn",
			"no-dupe-class-members": "off",
			"no-dupe-keys": "warn",
			"no-duplicate-case": "warn",
			"no-empty-character-class": "warn",
			"no-empty-pattern": "warn",
			"no-eval": "warn",
			"no-ex-assign": "warn",
			"no-extend-native": "warn",
			"no-extra-bind": "warn",
			"no-extra-label": "warn",
			"no-fallthrough": "warn",
			"no-func-assign": "warn",
			"no-implied-eval": "warn",
			"no-invalid-regexp": "warn",
			"no-iterator": "warn",
			"no-label-var": "warn",
			"no-labels": [
				"warn",
				{
					"allowLoop": true,
					"allowSwitch": false
				}
			],
			"no-lone-blocks": "warn",
			"no-loop-func": "warn",
			"no-mixed-operators": [
				"warn",
				{
					"groups": [
						[
							"&",
							"|",
							"^",
							"~",
							"<<",
							">>",
							">>>"
						],
						[
							"==",
							"!=",
							"===",
							"!==",
							">",
							">=",
							"<",
							"<="
						],
						[
							"&&",
							"||"
						],
						[
							"in",
							"instanceof"
						]
					],
					"allowSamePrecedence": false
				}
			],
			"no-multi-str": "warn",
			"no-native-reassign": "warn",
			"no-negated-in-lhs": "warn",
			"no-new-func": "warn",
			"no-new-object": "warn",
			"no-new-symbol": "warn",
			"no-new-wrappers": "warn",
			"no-obj-calls": "warn",
			"no-octal": "warn",
			"no-octal-escape": "warn",
			"no-redeclare": "warn",
			"no-regex-spaces": "warn",
			"no-restricted-globals": [
				"error",
				"addEventListener",
				"blur",
				"close",
				"closed",
				"confirm",
				"defaultStatus",
				"defaultstatus",
				"event",
				"external",
				"find",
				"focus",
				"frameElement",
				"frames",
				"history",
				"innerHeight",
				"innerWidth",
				"length",
				"location",
				"locationbar",
				"menubar",
				"moveBy",
				"moveTo",
				"name",
				"onblur",
				"onerror",
				"onfocus",
				"onload",
				"onresize",
				"onunload",
				"open",
				"opener",
				"opera",
				"outerHeight",
				"outerWidth",
				"pageXOffset",
				"pageYOffset",
				"parent",
				"print",
				"removeEventListener",
				"resizeBy",
				"resizeTo",
				"screen",
				"screenLeft",
				"screenTop",
				"screenX",
				"screenY",
				"scroll",
				"scrollbars",
				"scrollBy",
				"scrollTo",
				"scrollX",
				"scrollY",
				"self",
				"status",
				"statusbar",
				"stop",
				"toolbar",
				"top"
			],
			"no-restricted-properties": [
				"error",
				{
					"object": "require",
					"property": "ensure",
					"message": "Please use import() instead. More info: https://facebook.github.io/create-react-app/docs/code-splitting"
				},
				{
					"object": "System",
					"property": "import",
					"message": "Please use import() instead. More info: https://facebook.github.io/create-react-app/docs/code-splitting"
				}
			],
			"no-restricted-syntax": [
				"warn",
				"WithStatement"
			],
			"no-script-url": "warn",
			"no-self-assign": "warn",
			"no-self-compare": "warn",
			"no-sequences": "warn",
			"no-shadow-restricted-names": "warn",
			"no-sparse-arrays": "warn",
			"no-template-curly-in-string": "warn",
			"no-this-before-super": "warn",
			"no-throw-literal": "warn",
			"no-undef": "off",
			"no-unexpected-multiline": "warn",
			"no-unreachable": "warn",
			"no-unused-expressions": "off",
			"no-unused-labels": "warn",
			"no-unused-vars": "off",
			"no-use-before-define": "off",
			"no-useless-computed-key": "warn",
			"no-useless-concat": "warn",
			"no-useless-constructor": "off",
			"no-useless-escape": "warn",
			"no-useless-rename": [
				"warn",
				{
					"ignoreDestructuring": false,
					"ignoreImport": false,
					"ignoreExport": false
				}
			],
			"no-whitespace-before-property": "warn",
			"no-with": "warn",
			"react-hooks/config": "error",
			"react-hooks/error-boundaries": "error",
			"react-hooks/exhaustive-deps": "warn",
			"react-hooks/gating": "error",
			"react-hooks/globals": "error",
			"react-hooks/immutability": "error",
			"react-hooks/incompatible-library": "warn",
			"react-hooks/preserve-manual-memoization": "error",
			"react-hooks/purity": "error",
			"react-hooks/refs": "error",
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/set-state-in-effect": "error",
			"react-hooks/set-state-in-render": "error",
			"react-hooks/static-components": "error",
			"react-hooks/unsupported-syntax": "warn",
			"react-hooks/use-memo": "error",
			"react/forbid-foreign-prop-types": [
				"warn",
				{
					"allowInPropTypes": true
				}
			],
			"react/jsx-no-comment-textnodes": "warn",
			"react/jsx-no-duplicate-props": "warn",
			"react/jsx-no-target-blank": "warn",
			"react/jsx-no-undef": "error",
			"react/jsx-no-useless-fragment": "warn",
			"react/jsx-pascal-case": [
				"warn",
				{
					"allowAllCaps": true,
					"ignore": []
				}
			],
			"react/jsx-uses-react": "off",
			"react/jsx-uses-vars": "warn",
			"react/no-danger-with-children": "warn",
			"react/no-direct-mutation-state": "warn",
			"react/no-is-mounted": "warn",
			"react/no-typos": "error",
			"react/react-in-jsx-scope": "off",
			"react/require-render-return": "error",
			"react/style-prop-object": "warn",
			"require-yield": "warn",
			"rest-spread-spacing": [
				"warn",
				"never"
			],
			"strict": [
				"warn",
				"never"
			],
			"unicode-bom": [
				"warn",
				"never"
			],
			"use-isnan": "warn",
			"valid-typeof": "warn"
		},
	},
	{
		files,
		rules: {
			// Both were off in the shared base before this split: the preset
			// switched them on and the base switched them back.
			'import/first': 'off',
			'react-hooks/exhaustive-deps': 'off',
		},
	},
];
