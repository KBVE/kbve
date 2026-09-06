import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repin } from './repin-base-image.mjs';

const IMAGE = 'ghcr.io/kbve/chisel-ubuntu-axum';
const at = (text) => repin(text, IMAGE, '24.04.12');

test('rewrites a plain FROM pin', () => {
	assert.equal(at(`FROM ${IMAGE}:24.04.3\n`), `FROM ${IMAGE}:24.04.12\n`);
});

test('keeps the -builder suffix, which is tag and not version', () => {
	assert.equal(
		at(`FROM ${IMAGE}:24.04-builder AS builder\n`),
		`FROM ${IMAGE}:24.04.12-builder AS builder\n`,
	);
});

test('reaches past FROM flags', () => {
	// The pin that mattered: 79 files write it with --platform in between.
	assert.equal(
		at(`FROM --platform=linux/amd64 ${IMAGE}:24.04-builder AS b\n`),
		`FROM --platform=linux/amd64 ${IMAGE}:24.04.12-builder AS b\n`,
	);
});

test('leaves prose alone', () => {
	const doc = `#   ${IMAGE}:24.04-builder  (Rust + Node)\n`;
	assert.equal(at(doc), doc);
});

test('leaves other images alone', () => {
	const other = 'FROM ghcr.io/kbve/chisel-ubuntu-axum-other:24.04\nFROM rust:1.98-slim\n';
	assert.equal(at(other), other);
});

test('is idempotent', () => {
	const once = at(`FROM ${IMAGE}:24.04-builder\n`);
	assert.equal(at(once), once);
});

test('rewrites every stage in a multi-stage file', () => {
	const before = `FROM ${IMAGE}:24.04-builder AS a\nRUN true\nFROM ${IMAGE}:24.04.3\n`;
	assert.equal(
		at(before),
		`FROM ${IMAGE}:24.04.12-builder AS a\nRUN true\nFROM ${IMAGE}:24.04.12\n`,
	);
});
