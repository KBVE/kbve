import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
	DispatchPipelines,
	ICiProjectSchema,
	TestFrameworks,
} from './ICiProjectSchema';

describe('ICiProjectSchema', () => {
	it('parses a minimal valid entry with no proto fields set', () => {
		const result = ICiProjectSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it('parses Astro-only fields without touching the proto contract', () => {
		const r = ICiProjectSchema.safeParse({
			unsplash: 'photo-id',
			img: 'https://images.unsplash.com/photo-1234?fit=crop',
		});
		expect(r.success).toBe(true);
	});

	it('rejects a malformed img (non-URL string)', () => {
		const r = ICiProjectSchema.safeParse({ img: 'not-a-url' });
		expect(r.success).toBe(false);
	});

	it('accepts every value enumerated in DispatchPipelineSchema', () => {
		for (const p of DispatchPipelines) {
			const r = ICiProjectSchema.safeParse({ pipeline: p });
			expect(r.success).toBe(true);
		}
	});

	it('rejects pipelines outside the proto enum', () => {
		const r = ICiProjectSchema.safeParse({
			pipeline: 'not-a-real-pipeline',
		});
		expect(r.success).toBe(false);
	});

	it('accepts every TestFrameworkSchema value', () => {
		for (const f of TestFrameworks) {
			const r = ICiProjectSchema.safeParse({ test_framework: f });
			expect(r.success).toBe(true);
		}
	});

	it('rejects unknown test frameworks', () => {
		const r = ICiProjectSchema.safeParse({ test_framework: 'cobol' });
		expect(r.success).toBe(false);
	});

	it('round-trips a realistic entry', () => {
		const entry = {
			unsplash: 'photo-1581276879432-15e50529f34b',
			img: 'https://images.unsplash.com/photo-1581276879432-15e50529f34b?fit=crop&w=1400&h=700&q=75',
			pipeline: 'npm' as const,
			test_framework: 'typescript' as const,
		};
		const r = ICiProjectSchema.safeParse(entry);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.pipeline).toBe('npm');
			expect(r.data.test_framework).toBe('typescript');
		}
	});

	describe('fuzz', () => {
		it('any pipeline string from the enum always parses', () => {
			fc.assert(
				fc.property(
					fc.constantFrom(...DispatchPipelines),
					(pipeline) => {
						const r = ICiProjectSchema.safeParse({ pipeline });
						return r.success;
					},
				),
				{ numRuns: 100 },
			);
		});

		it('any random string outside the pipeline enum is rejected', () => {
			fc.assert(
				fc.property(
					fc
						.string({ minLength: 1, maxLength: 30 })
						.filter(
							(s) =>
								!(
									DispatchPipelines as readonly string[]
								).includes(s),
						),
					(s) => {
						const r = ICiProjectSchema.safeParse({ pipeline: s });
						return r.success === false;
					},
				),
				{ numRuns: 100 },
			);
		});

		it('schema is total — never throws on arbitrary shapes', () => {
			fc.assert(
				fc.property(
					fc.object({
						maxDepth: 2,
						maxKeys: 6,
					}),
					(obj) => {
						expect(() =>
							ICiProjectSchema.safeParse(obj),
						).not.toThrow();
					},
				),
				{ numRuns: 200 },
			);
		});
	});
});
