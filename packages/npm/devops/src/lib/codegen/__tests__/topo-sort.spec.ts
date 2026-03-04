import { describe, it, expect, beforeEach } from 'vitest';
import { topoSortMessages } from '../topo-sort.js';
import {
	makeDescMessage,
	makeScalarField,
	makeMessageField,
	makeListField,
	makeMapField,
	resetFieldCounter,
	ScalarType,
} from './test-factories.js';

describe('topoSortMessages', () => {
	beforeEach(() => {
		resetFieldCounter();
	});

	// ─── Basic cases ─────────────────────────────────────────────────────

	it('returns empty result for empty input', () => {
		const { sorted, lazyRefs } = topoSortMessages([]);
		expect(sorted).toEqual([]);
		expect(lazyRefs.size).toBe(0);
	});

	it('returns single message unchanged', () => {
		const msg = makeDescMessage('pkg.Foo', [
			makeScalarField('id', ScalarType.INT32),
		]);
		const { sorted, lazyRefs } = topoSortMessages([msg]);
		expect(sorted).toHaveLength(1);
		expect(sorted[0].typeName).toBe('pkg.Foo');
		expect(lazyRefs.size).toBe(0);
	});

	it('returns independent messages in original order', () => {
		const a = makeDescMessage('pkg.A', [
			makeScalarField('x', ScalarType.STRING),
		]);
		const b = makeDescMessage('pkg.B', [
			makeScalarField('y', ScalarType.INT32),
		]);
		const c = makeDescMessage('pkg.C', [
			makeScalarField('z', ScalarType.BOOL),
		]);
		const { sorted } = topoSortMessages([a, b, c]);
		expect(sorted.map((m) => m.typeName)).toEqual([
			'pkg.A',
			'pkg.B',
			'pkg.C',
		]);
	});

	// ─── Linear chains ──────────────────────────────────────────────────

	it('sorts A→B so B comes before A', () => {
		const b = makeDescMessage('pkg.B', [
			makeScalarField('val', ScalarType.STRING),
		]);
		const a = makeDescMessage('pkg.A', [makeMessageField('ref', b)]);

		const { sorted } = topoSortMessages([a, b]);
		expect(sorted.map((m) => m.typeName)).toEqual(['pkg.B', 'pkg.A']);
	});

	it('sorts A→B→C chain', () => {
		const c = makeDescMessage('pkg.C', [
			makeScalarField('v', ScalarType.INT32),
		]);
		const b = makeDescMessage('pkg.B', [makeMessageField('inner', c)]);
		const a = makeDescMessage('pkg.A', [makeMessageField('inner', b)]);

		const { sorted } = topoSortMessages([a, b, c]);
		expect(sorted.map((m) => m.typeName)).toEqual([
			'pkg.C',
			'pkg.B',
			'pkg.A',
		]);
	});

	// ─── Diamond ────────────────────────────────────────────────────────

	it('handles diamond deps: D→B,C  B→A  C→A', () => {
		const a = makeDescMessage('pkg.A', [
			makeScalarField('id', ScalarType.INT32),
		]);
		const b = makeDescMessage('pkg.B', [makeMessageField('a_ref', a)]);
		const c = makeDescMessage('pkg.C', [makeMessageField('a_ref', a)]);
		const d = makeDescMessage('pkg.D', [
			makeMessageField('b_ref', b),
			makeMessageField('c_ref', c),
		]);

		const { sorted } = topoSortMessages([d, c, b, a]);
		const names = sorted.map((m) => m.typeName);

		expect(names.indexOf('pkg.A')).toBeLessThan(names.indexOf('pkg.B'));
		expect(names.indexOf('pkg.A')).toBeLessThan(names.indexOf('pkg.C'));
		expect(names.indexOf('pkg.B')).toBeLessThan(names.indexOf('pkg.D'));
		expect(names.indexOf('pkg.C')).toBeLessThan(names.indexOf('pkg.D'));
	});

	// ─── Circular deps ──────────────────────────────────────────────────

	it('detects mutual cycle A↔B and adds to lazyRefs', () => {
		// Create A referencing B and B referencing A
		const bPlaceholder = makeDescMessage('pkg.B', [
			makeScalarField('dummy', ScalarType.INT32),
		]);
		const a = makeDescMessage('pkg.A', [
			makeMessageField('b_ref', bPlaceholder),
		]);
		// Now create B referencing A
		const b = makeDescMessage('pkg.B', [makeMessageField('a_ref', a)]);

		const { sorted, lazyRefs } = topoSortMessages([a, b]);
		// Both messages should still appear in sorted output
		expect(sorted).toHaveLength(2);
		// At least one of them should be marked for z.lazy()
		expect(lazyRefs.size).toBeGreaterThan(0);
		// The back-edge target should be in lazyRefs
		expect(lazyRefs.has('pkg.A') || lazyRefs.has('pkg.B')).toBe(true);
	});

	it('detects ring cycle A→B→C→A', () => {
		const cPlaceholder = makeDescMessage('pkg.C', [
			makeScalarField('dummy', ScalarType.INT32),
		]);
		const bPlaceholder = makeDescMessage('pkg.B', [
			makeScalarField('dummy', ScalarType.INT32),
		]);
		const a = makeDescMessage('pkg.A', [
			makeMessageField('b_ref', bPlaceholder),
		]);
		const b = makeDescMessage('pkg.B', [
			makeMessageField('c_ref', cPlaceholder),
		]);
		const c = makeDescMessage('pkg.C', [makeMessageField('a_ref', a)]);

		const { sorted, lazyRefs } = topoSortMessages([a, b, c]);
		expect(sorted).toHaveLength(3);
		expect(lazyRefs.size).toBeGreaterThan(0);
	});

	it('detects self-referencing message', () => {
		// Message that references itself (e.g., tree node)
		const selfPlaceholder = makeDescMessage('pkg.Node', [
			makeScalarField('dummy', ScalarType.INT32),
		]);
		const node = makeDescMessage('pkg.Node', [
			makeScalarField('id', ScalarType.INT32),
			makeMessageField('child', selfPlaceholder),
		]);

		const { sorted, lazyRefs } = topoSortMessages([node]);
		expect(sorted).toHaveLength(1);
		expect(lazyRefs.has('pkg.Node')).toBe(true);
	});

	// ─── Mixed isolated + chains ────────────────────────────────────────

	it('handles mix of isolated messages and chains', () => {
		const leaf = makeDescMessage('pkg.Leaf', [
			makeScalarField('id', ScalarType.INT32),
		]);
		const node = makeDescMessage('pkg.Node', [
			makeMessageField('child', leaf),
		]);
		const standalone = makeDescMessage('pkg.Standalone', [
			makeScalarField('name', ScalarType.STRING),
		]);

		const { sorted } = topoSortMessages([node, standalone, leaf]);
		const names = sorted.map((m) => m.typeName);

		expect(names.indexOf('pkg.Leaf')).toBeLessThan(
			names.indexOf('pkg.Node'),
		);
		expect(names).toContain('pkg.Standalone');
	});

	// ─── Excluded deps ──────────────────────────────────────────────────

	it('ignores references to messages not in the input set', () => {
		const external = makeDescMessage('other.External', [
			makeScalarField('x', ScalarType.STRING),
		]);
		const msg = makeDescMessage('pkg.Msg', [
			makeMessageField('ext', external),
		]);

		const { sorted } = topoSortMessages([msg]);
		expect(sorted).toHaveLength(1);
		expect(sorted[0].typeName).toBe('pkg.Msg');
	});

	// ─── List/map message dep tracking ──────────────────────────────────

	it('tracks dependencies through list<message> fields', () => {
		const item = makeDescMessage('pkg.Item', [
			makeScalarField('id', ScalarType.INT32),
		]);
		const container = makeDescMessage('pkg.Container', [
			makeListField('items', 'message', { message: item }),
		]);

		const { sorted } = topoSortMessages([container, item]);
		expect(sorted.map((m) => m.typeName)).toEqual([
			'pkg.Item',
			'pkg.Container',
		]);
	});

	it('tracks dependencies through map<string, message> fields', () => {
		const val = makeDescMessage('pkg.Val', [
			makeScalarField('data', ScalarType.STRING),
		]);
		const lookup = makeDescMessage('pkg.Lookup', [
			makeMapField('entries', ScalarType.STRING, 'message', {
				message: val,
			}),
		]);

		const { sorted } = topoSortMessages([lookup, val]);
		expect(sorted.map((m) => m.typeName)).toEqual([
			'pkg.Val',
			'pkg.Lookup',
		]);
	});

	// ─── Cross-file / multiple refs ─────────────────────────────────────

	it('handles message referencing multiple messages from different depths', () => {
		const deep = makeDescMessage('a.Deep', [
			makeScalarField('v', ScalarType.INT32),
		]);
		const mid = makeDescMessage('b.Mid', [makeMessageField('deep', deep)]);
		const top = makeDescMessage('c.Top', [
			makeMessageField('mid', mid),
			makeMessageField('deep', deep),
		]);

		const { sorted } = topoSortMessages([top, mid, deep]);
		const names = sorted.map((m) => m.typeName);
		expect(names.indexOf('a.Deep')).toBeLessThan(names.indexOf('b.Mid'));
		expect(names.indexOf('b.Mid')).toBeLessThan(names.indexOf('c.Top'));
	});

	// ─── lazyRefs empty for acyclic graphs ──────────────────────────────

	it('returns empty lazyRefs for acyclic graphs', () => {
		const b = makeDescMessage('pkg.B', [
			makeScalarField('val', ScalarType.STRING),
		]);
		const a = makeDescMessage('pkg.A', [makeMessageField('ref', b)]);

		const { lazyRefs } = topoSortMessages([a, b]);
		expect(lazyRefs.size).toBe(0);
	});
});
