// Global test setup for desktop-kbve.
// Tauri API mocks are handled via vitest.config.ts resolve aliases.

// jsdom does not implement window.matchMedia — stub it for tests that
// resolve the 'system' theme via prefers-color-scheme.
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		matches: query === '(prefers-color-scheme: dark)',
		media: query,
		onchange: null,
		addListener: (_: unknown) => {
			/* deprecated */
		},
		removeListener: (_: unknown) => {
			/* deprecated */
		},
		addEventListener: (_: unknown, __: unknown) => {
			/* stub */
		},
		removeEventListener: (_: unknown, __: unknown) => {
			/* stub */
		},
		dispatchEvent: () => false,
	}),
});
