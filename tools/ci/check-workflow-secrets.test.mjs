import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { readInventory, declaredSecrets, unresolvable } from './check-workflow-secrets.mjs';

const inv = readInventory(`
# comment
[exists]
UNITY_PAT
ITCH_API

[missing]
CURSEFORGE_TOKEN
`);
const known = new Set([...inv.exists, ...inv.missing]);

test('reads both sections and ignores comments', () => {
	assert.deepEqual([...inv.exists], ['UNITY_PAT', 'ITCH_API']);
	assert.deepEqual([...inv.missing], ['CURSEFORGE_TOKEN']);
});

test('flags a secret that exists nowhere', () => {
	// The one that broke every post-publish.
	const text = 'jobs:\n  a:\n    secrets:\n      TRIGGER_PAT: ${{ secrets.TRIGGER_PAT }}\n';
	assert.deepEqual(unresolvable(text, parse(text), known), [{ line: 4, name: 'TRIGGER_PAT' }]);
});

test('accepts a real secret', () => {
	const text = 'x: ${{ secrets.UNITY_PAT }}\n';
	assert.deepEqual(unresolvable(text, parse(text), known), []);
});

test('accepts a known-missing secret without failing the lane', () => {
	const text = 'x: ${{ secrets.CURSEFORGE_TOKEN }}\n';
	assert.deepEqual(unresolvable(text, parse(text), known), []);
});

test('accepts GITHUB_TOKEN, which GitHub always provides', () => {
	const text = 'x: ${{ secrets.GITHUB_TOKEN }}\n';
	assert.deepEqual(unresolvable(text, parse(text), known), []);
});

test("accepts a reusable workflow's own declared input", () => {
	// `on:` is the boolean true once YAML 1.1 is done with it.
	const text = [
		'on:',
		'  workflow_call:',
		'    secrets:',
		'      GHCR_TOKEN:',
		'        required: true',
		'jobs:',
		'  a:',
		'    steps:',
		'      - run: echo ${{ secrets.GHCR_TOKEN }}',
	].join('\n');
	const doc = parse(text);
	assert.deepEqual([...declaredSecrets(doc)], ['GHCR_TOKEN']);
	assert.deepEqual(unresolvable(text, doc, known), []);
});
