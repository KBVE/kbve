import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, vocabulary } from './validate.mjs';
import { buildLock, extraScopes, TYPES } from './sync.mjs';

const VOCAB = { types: ['feat', 'fix', 'chore', 'ci'], scopes: ['axum-kbve', 'reel', 'ci'] };

test('a conventional subject with a known type and scope passes', () => {
	assert.deepEqual(validate('feat(axum-kbve): add a thing', VOCAB), []);
	assert.deepEqual(validate('fix: no scope is fine', VOCAB), []);
	assert.deepEqual(validate('feat(ci)!: a breaking change', VOCAB), []);
});

test('a comma-separated scope is checked part by part', () => {
	assert.deepEqual(validate('fix(reel,ci): share a thing', VOCAB), []);
	const problems = validate('fix(reel,nope): share a thing', VOCAB);
	assert.ok(problems[0].includes('nope'));
	assert.ok(!problems[0].includes('reel'));
});

test('git’s own prefixes are exempt', () => {
	for (const subject of [
		'Merge pull request #1 from x/y',
		'Revert "feat(ci): a thing"',
		'fixup! feat(ci): a thing',
		'Reapply "fix(ci): a thing"',
	]) {
		assert.deepEqual(validate(subject, VOCAB), [], subject);
	}
});

test('an unconventional subject is reported once, not per rule', () => {
	const problems = validate('just some words', VOCAB);
	assert.equal(problems.length, 2);
	assert.ok(problems[0].includes('is not a conventional commit'));
});

test('unknown types and scopes are named', () => {
	assert.ok(validate('nope(ci): x', VOCAB)[0].includes('unknown type: nope'));
	assert.ok(validate('feat(nope): x', VOCAB)[0].includes('unknown scope'));
});

test('style is not enforced, because every style rule tried was wrong about the history', () => {
	// 112 of 800 subjects end in a full stop; 61 of 3000 begin with a capital,
	// mostly proper nouns; 25 are simply long. All three are house style.
	assert.deepEqual(validate('feat(ci): ends with a stop.', VOCAB), []);
	assert.deepEqual(validate("feat(ci): Marlow's conversation moves", VOCAB), []);
	assert.deepEqual(validate(`feat(ci): ${'x'.repeat(150)}`, VOCAB), []);
});

test('a pipe-separated type is a type, and each part is checked', () => {
	assert.deepEqual(validate('feat|fix(ci): two things at once', VOCAB), []);
	assert.ok(validate('feat|nope(ci): x', VOCAB)[0].includes('nope'));
});

test('a scope may be marked with a leading bang, or name a type', () => {
	assert.deepEqual(validate('ci(!fix): a fix to the pipeline', VOCAB), []);
	assert.deepEqual(validate('ci(fix): a fix to the pipeline', VOCAB), []);
});

test("the atomic workflow's own pull request title is exempt", () => {
	assert.deepEqual(validate('Atomic: unreal debug symbols (#16516)', VOCAB), []);
});

test('comment lines and empty messages', () => {
	assert.deepEqual(validate('# a comment\nfeat(ci): a thing', VOCAB), []);
	assert.deepEqual(validate('', VOCAB), ['the message is empty']);
	assert.deepEqual(validate('   ', VOCAB), ['the message is empty']);
});

test('the lock unions project ids with the repository-wide scopes', () => {
	const lock = buildLock(['b-project', 'a-project'], ['ci', 'a-project']);
	assert.deepEqual(lock.scopes, ['a-project', 'b-project', 'ci']);
	assert.deepEqual(lock.types, [...TYPES].sort());
});

test('extraScopes reads the quoted entries out of scopes.yml', () => {
	assert.deepEqual(extraScopes("extra:\n  - 'ci'\n  # a comment\n  - 'moon'\n"), ['ci', 'moon']);
});

test('the committed lock is what the vocabulary loader reads', () => {
	const vocab = vocabulary(readFileSync(new URL('./scopes.lock.json', import.meta.url), 'utf8'));
	assert.ok(vocab.types.includes('feat'));
	assert.ok(vocab.scopes.includes('ci'));
	// A project id, proving the lock was generated from the graph rather than
	// from scopes.yml alone.
	assert.ok(vocab.scopes.includes('axum-kbve'));
});
