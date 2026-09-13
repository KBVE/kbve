import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareSemver,
  previousTag,
  parseSubject,
  section,
  isVersionBump,
  bullet,
  render,
  refExists,
  sourceHistory,
  commitsFor,
} from './notes.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('orders versions numerically, not as strings', () => {
  // The string comparison that this replaces puts 0.1.10 before 0.1.9.
  assert.ok(compareSemver('0.1.9', '0.1.10') < 0);
  assert.ok(compareSemver('0.2.0', '0.10.0') < 0);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
});

test('a release outranks its own prereleases', () => {
  assert.ok(compareSemver('1.0.0-rc.1', '1.0.0') < 0);
  assert.ok(compareSemver('1.0.0-rc.1', '1.0.0-rc.2') < 0);
  assert.ok(compareSemver('1.0.0-alpha', '1.0.0-beta') < 0);
});

test('an unparseable version sorts below every real one', () => {
  // Sorting it highest would make it the previous tag for everything after it,
  // and the range would start from the wrong commit with no visible error.
  assert.ok(compareSemver('not-a-version', '0.0.1') < 0);
});

test('finds the previous tag for this project only', () => {
  const tags = [
    'rentearth-bevy@0.1.0',
    'rentearth-bevy@0.1.1',
    'gilded-gazette@0.1.13',
    'fish-and-chip@0.1.0',
  ];
  assert.equal(previousTag(tags, 'rentearth-bevy', '0.1.1'), 'rentearth-bevy@0.1.0');
});

test('does not match a project whose id is a prefix of another', () => {
  const tags = ['rentearth-bevy-tools@0.9.0', 'rentearth-bevy@0.1.0'];
  assert.equal(previousTag(tags, 'rentearth-bevy', '0.2.0'), 'rentearth-bevy@0.1.0');
});

test('ignores tags at or above the version being released', () => {
  // Regenerating the notes for an old tag must give that tag's range, not one
  // reaching back from the newest release.
  const tags = ['p@0.1.0', 'p@0.2.0', 'p@0.3.0'];
  assert.equal(previousTag(tags, 'p', '0.2.0'), 'p@0.1.0');
});

test('returns null for a first release', () => {
  assert.equal(previousTag(['other@1.0.0'], 'p', '0.1.0'), null);
});

test('parses a conventional subject', () => {
  assert.deepEqual(parseSubject('feat(rentearth-bevy): draw the trees'), {
    type: 'feat',
    scope: 'rentearth-bevy',
    breaking: false,
    text: 'draw the trees',
  });
});

test('keeps a non-conventional subject rather than dropping the commit', () => {
  // Two commits predate the hook. Silently omitting them would leave a hole in
  // the notes that nothing reports.
  const parsed = parseSubject('resolving the water');
  assert.equal(parsed.type, null);
  assert.equal(parsed.text, 'resolving the water');
  assert.equal(section({ ...parsed }), 'Internal');
});

test('breaking changes outrank their own type', () => {
  assert.equal(section(parseSubject('feat(p)!: rewrite the save format')), 'Breaking changes');
  assert.equal(section(parseSubject('feat(p): add a thing')), 'Features');
  assert.equal(section(parseSubject('content(p): write the intro')), 'Features');
  assert.equal(section(parseSubject('perf(ci): cache the build')), 'Performance');
  assert.equal(section(parseSubject('chore(p): tidy')), 'Internal');
});

test('drops the version bump commit and nothing else', () => {
  assert.ok(isVersionBump(parseSubject('chore(p): 0.1.1'), 'p', '0.1.1'));
  assert.ok(!isVersionBump(parseSubject('chore(p): 0.1.0'), 'p', '0.1.1'));
  assert.ok(!isVersionBump(parseSubject('chore(other): 0.1.1'), 'p', '0.1.1'));
  assert.ok(!isVersionBump(parseSubject('fix(p): 0.1.1'), 'p', '0.1.1'));
});

test('shows the scope only when it names something else', () => {
  const own = { ...parseSubject('feat(p): a thing'), sha: 'abcdef1234' };
  assert.equal(bullet(own, 'p'), '- a thing (`abcdef1`)');
  const foreign = { ...parseSubject('perf(ci): cache the build'), sha: 'abcdef1234' };
  assert.equal(bullet(foreign, 'p'), '- **ci:** cache the build (`abcdef1`)');
});

test('renders sections in order and links the comparison', () => {
  const commits = [
    'chore(p): 0.2.0',
    'fix(p): stop the pool going negative',
    'feat(p): add a thing',
    'perf(ci): cache the build',
  ].map((subject, i) => ({ ...parseSubject(subject), sha: `${i}`.repeat(40) }));

  const out = render({
    project: 'p',
    version: '0.2.0',
    tag: 'p@0.2.0',
    previous: 'p@0.1.0',
    commits,
    repo: 'KBVE/workspace',
  });

  assert.match(out, /^## p 0\.2\.0$/m);
  assert.ok(out.indexOf('### Features') < out.indexOf('### Fixes'));
  assert.ok(out.indexOf('### Fixes') < out.indexOf('### Performance'));
  assert.doesNotMatch(out, /0\.2\.0 \(`0000000`\)/, 'the version bump should be dropped');
  assert.match(out, /\*\*ci:\*\* cache the build/);
  assert.match(
    out,
    /compare\/p@0\.1\.0\.\.\.p@0\.2\.0/,
  );
});

test('says so when a release carries no commits of its own', () => {
  // A tag pushed for a version bump alone. An empty body reads as a broken
  // generator; this reads as what happened.
  const out = render({
    project: 'p',
    version: '0.2.0',
    tag: 'p@0.2.0',
    previous: 'p@0.1.0',
    commits: [{ ...parseSubject('chore(p): 0.2.0'), sha: 'a'.repeat(40) }],
    repo: 'KBVE/workspace',
  });
  assert.match(out, /No changes to `p` since p@0\.1\.0\./);
});

test('reports whether git can resolve a ref instead of throwing', () => {
  // The preview path depends on this: `git log` on a tag that does not exist
  // yet is a fatal error, and previewing before tagging is the whole point.
  assert.equal(refExists('HEAD'), true);
  assert.equal(refExists('no-such-tag-anywhere@9.9.9'), false);
});

test('a first release has no comparison link to offer', () => {
  const out = render({
    project: 'p',
    version: '0.1.0',
    tag: 'p@0.1.0',
    previous: null,
    commits: [{ ...parseSubject('feat(p): the first thing'), sha: 'a'.repeat(40) }],
    repo: 'KBVE/workspace',
  });
  assert.doesNotMatch(out, /Full changelog/);
});

/** A throwaway repo whose project tree is moved once, which is the shape the
 *  whole monorepo took when products moved into apps/<product>/ and services
 *  into services/. */
function repoWithAMovedProject() {
  const dir = mkdtempSync(join(tmpdir(), 'notes-renames-'));
  const run = (...args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 'test@example.com');
  run('config', 'user.name', 'test');

  mkdirSync(join(dir, 'apps/thing'), { recursive: true });
  writeFileSync(join(dir, 'apps/thing/main.rs'), 'fn main() {}\n');
  run('add', '-A');
  run('commit', '-qm', 'feat(thing): the original commit');

  writeFileSync(join(dir, 'apps/thing/main.rs'), 'fn main() { work(); }\n');
  run('add', '-A');
  run('commit', '-qm', 'fix(thing): a change made before the move');

  mkdirSync(join(dir, 'services'), { recursive: true });
  run('mv', 'apps/thing', 'services/thing');
  run('add', '-A');
  run('commit', '-qm', 'refactor(thing): move it to services');

  writeFileSync(join(dir, 'services/thing/main.rs'), 'fn main() { more(); }\n');
  run('add', '-A');
  run('commit', '-qm', 'feat(thing): a change made after the move');
  return dir;
}

test('follows a project through a move when collecting its history', () => {
  // Without this, `git log -- services/thing` stops at the move and the notes
  // silently omit everything older: met shipped 0.2.0 with 5 commits listed
  // and 37 in its history.
  const dir = repoWithAMovedProject();
  try {
    const roots = sourceHistory('HEAD', 'services/thing', dir);
    assert.deepEqual(roots.sort(), ['apps/thing', 'services/thing']);

    const subjects = commitsFor('HEAD', roots, dir).map((c) => c.subject);
    assert.equal(subjects.length, 4, subjects.join(' | '));
    assert.ok(subjects.some((s) => s.includes('the original commit')));
    assert.ok(subjects.some((s) => s.includes('before the move')));
    assert.ok(subjects.some((s) => s.includes('after the move')));

    // The single-path behaviour this replaces, kept as the contrast: three of
    // the four commits are invisible from the new path alone.
    const narrow = commitsFor('HEAD', 'services/thing', dir);
    assert.equal(narrow.length, 2, narrow.map((c) => c.subject).join(' | '));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a project that never moved reports only its own path', () => {
  // The scan runs on every release, so the common case must not invent roots.
  const dir = repoWithAMovedProject();
  try {
    assert.deepEqual(sourceHistory('HEAD', 'apps/never-existed', dir), [
      'apps/never-existed',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
