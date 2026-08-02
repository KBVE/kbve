import { describe, it, expect } from 'vitest';
import { buildNamespaceRollup, CLUSTER_NS_LABEL } from '../chRollup';

describe('buildNamespaceRollup', () => {
	it('aggregates per namespace and sorts by total desc', () => {
		const meta = {
			rows: [
				{ pod_namespace: 'a', level: 'error', cnt: 10 },
				{ pod_namespace: 'a', level: 'info', cnt: 100 },
				{ pod_namespace: 'b', level: 'warn', cnt: 500 },
			],
		};
		const out = buildNamespaceRollup(meta);
		expect(out[0].namespace).toBe('b');
		expect(out.find((r) => r.namespace === 'a')).toMatchObject({ total: 110, errors: 10 });
	});

	it('buckets empty-string namespaces under the cluster label', () => {
		const out = buildNamespaceRollup({
			rows: [
				{ pod_namespace: '', level: 'info', cnt: 3 },
				{ level: 'error', cnt: 2 },
			],
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			namespace: CLUSTER_NS_LABEL,
			total: 5,
			errors: 2,
		});
	});
});
