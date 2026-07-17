import { describe, it, expect } from 'vitest';
import { WORKFLOWS, workflowByKey } from '../constants';
import { WorkflowDefSchema } from '../generated/workflow-schema';

describe('WORKFLOWS registry', () => {
	it('every entry validates against the generated schema', () => {
		for (const w of WORKFLOWS) {
			expect(() => WorkflowDefSchema.parse(w)).not.toThrow();
		}
	});

	it('keys are unique', () => {
		const keys = WORKFLOWS.map((w) => w.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('workflowByKey resolves a known key and misses unknown', () => {
		expect(workflowByKey('poem')?.backend).toBe('windmill');
		expect(workflowByKey('nope')).toBeUndefined();
	});
});
