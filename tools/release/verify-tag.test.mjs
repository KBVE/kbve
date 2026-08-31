import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTag, cargoVersion, tomlVersion, godotVersion, TagError } from './verify-tag.mjs';

test('parseTag splits on the last @, so scoped names survive', () => {
	assert.deepEqual(parseTag('axum-kbve@0.5.2'), { project: 'axum-kbve', version: '0.5.2' });
	assert.deepEqual(parseTag('@kbve/astro@1.2.3'), { project: '@kbve/astro', version: '1.2.3' });
});

test('parseTag rejects anything that is not <project>@<version>', () => {
	for (const bad of ['axum-kbve', '@1.0.0', 'axum-kbve@', '']) {
		assert.throws(() => parseTag(bad), TagError, bad);
	}
});

test('cargoVersion reads [package] and not a dependency version', () => {
	const text = `[package]\nname = "q"\nversion = "0.1.7"\n\n[dependencies]\nserde = { version = "1.0.0" }\n`;
	assert.equal(cargoVersion(text), '0.1.7');
});

test('cargoVersion reports an inherited workspace version rather than a value', () => {
	assert.deepEqual(cargoVersion('[package]\nversion.workspace = true\n'), { inherited: true });
	assert.deepEqual(cargoVersion('[package]\nversion = { workspace = true }\n'), {
		inherited: true,
	});
});

test('cargoVersion ignores a version that is only in a dependency table', () => {
	assert.equal(cargoVersion('[dependencies]\nserde = "1.0"\nversion = "9.9.9"\n'), null);
});

test('tomlVersion reads both version.toml shapes', () => {
	assert.equal(tomlVersion('version = "1.0.67"\npublish = true\n'), '1.0.67');
	assert.equal(tomlVersion('[package]\nversion = "24.04.11"\n', 'package'), '24.04.11');
});

test('tomlVersion scoped to a section ignores the same key elsewhere', () => {
	const text = '[tool.other]\nversion = "9.9.9"\n\n[project]\nversion = "2.0.0"\n';
	assert.equal(tomlVersion(text, 'project'), '2.0.0');
});

test('godotVersion reads config/version only under [application]', () => {
	const text = '[rendering]\nconfig/version="9.9.9"\n\n[application]\nconfig/version="1.4.0"\n';
	assert.equal(godotVersion(text), '1.4.0');
});
