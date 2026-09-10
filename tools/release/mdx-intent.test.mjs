import { test } from 'node:test';
import assert from 'node:assert/strict';

import { intentFor, SKIP } from './mdx-intent.mjs';

/** A project doc with the frontmatter fields the trigger reads. */
function doc({ version, app = 'demo', extra = '' }) {
	return [
		'---',
		'title: Demo',
		app === null ? '' : `app_name: ${app}`,
		version === null ? '' : `version: "${version}"`,
		extra,
		'---',
		'',
		'Body text.',
	]
		.filter((line) => line !== '')
		.join('\n');
}

const releasable = new Map([['demo', { id: 'demo', source: 'x', config: { tags: ['docker'] } }]]);
const noTags = new Set();

function ctx({ projects = releasable, existingTags = noTags } = {}) {
	return { projects, existingTags };
}

// ---------------------------------------------------------------------------
// The bump is the request
// ---------------------------------------------------------------------------

test('a changed version asks for that tag', () => {
	const out = intentFor(doc({ version: '0.1.51' }), doc({ version: '0.1.50' }), ctx());
	assert.equal(out.tag, 'demo@0.1.51');
	assert.equal(out.project, 'demo');
	assert.equal(out.version, '0.1.51');
	assert.equal(out.skip, undefined);
});

test('an unchanged version asks for nothing', () => {
	// The common case by far: docs are edited for prose far more often than
	// for releases, and on a repo with five tags nothing else separates them.
	const before = doc({ version: '0.1.50' });
	const after = doc({ version: '0.1.50', extra: 'sidebar:\n    order: 3' });
	assert.equal(intentFor(after, before, ctx()).skip, SKIP.UNCHANGED);
});

test('a doc added in this push asks for nothing', () => {
	// A file appearing at a path is not a version bump. Moving these docs out
	// of astro-kbve into docs/project/ presented all 127 as new in one push,
	// and treating the version they carried as intent would have asked for
	// forty releases for a `git mv`.
	const out = intentFor(doc({ version: '1.0.0' }), null, ctx());
	assert.equal(out.skip, SKIP.NEW_DOC);
	assert.equal(out.tag, undefined);
});

test('a version moved backwards asks for nothing', () => {
	// Reverting a doc is not a request to re-release an older number.
	const out = intentFor(doc({ version: '0.1.49' }), doc({ version: '0.1.51' }), ctx());
	assert.equal(out.skip, SKIP.BACKWARDS);
});

// ---------------------------------------------------------------------------
// The two routes must not push each other
// ---------------------------------------------------------------------------

test('an existing tag asks for nothing, so the tag route cannot loop', () => {
	// Releasing by tag syncs the doc forward, and that commit lands on dev like
	// any other push. Read as a fresh bump it would tag the same version again,
	// and each release would trigger the next.
	const out = intentFor(doc({ version: '0.1.52' }), doc({ version: '0.1.51' }), {
		projects: releasable,
		existingTags: new Set(['demo@0.1.52']),
	});
	assert.equal(out.skip, SKIP.TAG_EXISTS);
	assert.equal(out.tag, 'demo@0.1.52', 'the tag is still reported, for the log line');
});

test('a bump past an existing tag still asks for the new tag', () => {
	// Only the exact tag blocks. An older tag existing must not stop the next.
	const out = intentFor(doc({ version: '0.1.53' }), doc({ version: '0.1.52' }), {
		projects: releasable,
		existingTags: new Set(['demo@0.1.51', 'demo@0.1.52']),
	});
	assert.equal(out.tag, 'demo@0.1.53');
	assert.equal(out.skip, undefined);
});

// ---------------------------------------------------------------------------
// Docs that cannot name a release
// ---------------------------------------------------------------------------

test('a doc whose app_name is not a moon project is reported, not silently dropped', () => {
	// Seven docs name something that is not a project id -- unity-rareicon.mdx
	// says `rareicon`, unreal-chuck-beta.mdx says `chuck`. Bumping one of those
	// looks done to whoever did it and would never ship.
	const out = intentFor(doc({ version: '2.0.0', app: 'not-a-project' }), doc({ version: '1.0.0', app: 'not-a-project' }), ctx());
	assert.equal(out.skip, SKIP.NOT_A_PROJECT);
	assert.equal(out.project, 'not-a-project');
});

test('a project with no release lane asks for nothing', () => {
	const projects = new Map([['demo', { id: 'demo', source: 'x', config: { tags: ['vite'] } }]]);
	const out = intentFor(doc({ version: '2.0.0' }), doc({ version: '1.0.0' }), ctx({ projects }));
	assert.equal(out.skip, SKIP.NO_LANE);
});

test('a doc with no version or no app_name asks for nothing', () => {
	assert.equal(intentFor(doc({ version: null }), null, ctx()).skip, SKIP.NO_VERSION);
	assert.equal(intentFor(doc({ version: '1.0.0', app: null }), null, ctx()).skip, SKIP.NO_APP_NAME);
});

// ---------------------------------------------------------------------------
// Frontmatter reading
// ---------------------------------------------------------------------------

test('a nested version: is not mistaken for the release version', () => {
	const before = doc({ version: '1.0.0', extra: 'kube:\n    version: "9.9.9"' });
	const after = doc({ version: '1.0.1', extra: 'kube:\n    version: "9.9.9"' });
	assert.equal(intentFor(after, before, ctx()).tag, 'demo@1.0.1');
});

test('a version: in the body is not a bump', () => {
	const before = doc({ version: '1.0.0' });
	const after = doc({ version: '1.0.0' }) + '\n\nSee version: "2.0.0" in the notes.\n';
	assert.equal(intentFor(after, before, ctx()).skip, SKIP.UNCHANGED);
});

test('a date-shaped version bumps like any other', () => {
	// chisel-ubuntu-axum releases as 24.04.13.
	const out = intentFor(doc({ version: '24.04.13' }), doc({ version: '24.04.12' }), ctx());
	assert.equal(out.tag, 'demo@24.04.13');
});
