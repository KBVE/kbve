import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			'@kbve/proto/chat-schema': fileURLToPath(
				new URL(
					'../../data/codegen/generated/chat-schema.ts',
					import.meta.url,
				),
			),
		},
	},
	test: {
		environment: 'node',
		include: ['**/*.test.ts'],
	},
});
