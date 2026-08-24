// The e2e suite lives in its own config because it talks to a running compose
// stack. Leaving it in the default include meant the vitest plugin's inferred
// `test` target -- which the affected lint/test sweep runs on a CI box with no
// stack -- executed it and failed every time.
export default {
	test: {
		include: ['src/**/*.spec.ts'],
	},
};
