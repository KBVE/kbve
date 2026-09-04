// What has been released, and what is waiting.
//
// The tag is the release act and the manifest is the declaration, so "has this
// shipped" is a question about the relationship between the two -- and until
// now nothing asked it. audit.mjs proves every lane-tagged project *could*
// release; this says which ones *should*, and what a release would contain.
//
// check-drift.sh asked a version of this question against the dispatch
// manifest's 27 entries, comparing source to version.toml to the registry back
// when CI wrote version.toml after a publish. Under tags version.toml is a
// hand-edited declaration like any other manifest, so the comparison that
// matters moved: manifest against the newest tag for that project, which is
// the only record of what actually shipped.
//
// Local only, deliberately. Registries answer a different question -- whether
// an upload landed -- and asking 79 of them turns a command you run while
// thinking into one you run while waiting.

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifestVersion, lanes, TagError } from './verify-tag.mjs';
import { compareSemver, commitsFor } from './notes.mjs';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const json = process.argv.includes('--json');

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

const query = (args) =>
  JSON.parse(
    execFileSync('moon', ['query', ...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

const allTags = git(['tag', '--list']).split('\n').filter(Boolean);

// The newest tag for one project, by version rather than by tag date: a patch
// cut from an older branch lands later in time and is still not the newest
// release, and sorting by creatordate would call it one.
function latestTag(project) {
  const prefix = `${project}@`;
  const versions = allTags
    .filter((t) => t.startsWith(prefix))
    .map((t) => t.slice(prefix.length))
    .sort(compareSemver);
  return versions.length ? versions[versions.length - 1] : null;
}

const projects = query(['projects']).projects.sort((a, b) => a.id.localeCompare(b.id));
const rows = [];

for (const project of projects) {
  const tags = project.config.tags ?? [];
  if (lanes(tags).length === 0) continue;

  let version = null;
  try {
    ({ version } = manifestVersion(root, project.source));
  } catch (error) {
    if (!(error instanceof TagError)) throw error;
    version = null;
  }

  const released = latestTag(project.id);
  // Commits touching this project's source since its last release. Answers the
  // question a version number cannot: whether a bump is actually owed.
  const since = released
    ? commitsFor(`${project.id}@${released}..HEAD`, project.source, root).length
    : null;

  let state;
  if (!version) state = 'no-version';
  else if (!released) state = 'never-released';
  else {
    const cmp = compareSemver(version, released);
    if (cmp > 0) state = 'tag-pending';
    else if (cmp < 0) state = 'manifest-behind';
    else state = since > 0 ? 'changes-unreleased' : 'current';
  }

  rows.push({
    project: project.id,
    lanes: lanes(tags).join(','),
    manifest: version,
    released,
    commitsSince: since,
    state,
  });
}

if (json) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

// Ordered by what a person does next: things a tag would ship, then things
// that need a bump first, then the settled ones.
const order = ['tag-pending', 'changes-unreleased', 'manifest-behind', 'no-version', 'never-released', 'current'];
const label = {
  'tag-pending': 'manifest bumped, not tagged -- a tag would release it',
  'changes-unreleased': 'source changed since its last tag -- needs a bump',
  'manifest-behind': 'manifest older than its newest tag -- look at this',
  'no-version': 'lane tag but no version manifest -- audit.mjs explains',
  'never-released': 'no tag has ever named it',
  current: 'tag matches manifest, nothing new since',
};

for (const state of order) {
  const group = rows.filter((r) => r.state === state);
  if (group.length === 0) continue;
  console.log(`\n${state}  (${group.length})  -- ${label[state]}`);
  for (const r of group) {
    const parts = [`  ${r.project.padEnd(34)}`, `${r.manifest ?? '-'}`.padEnd(12)];
    if (r.released) parts.push(`released ${r.released}`.padEnd(22));
    if (r.commitsSince) parts.push(`${r.commitsSince} commit(s) since`);
    console.log(parts.join(' '));
  }
}

const counts = order
  .map((s) => [s, rows.filter((r) => r.state === s).length])
  .filter(([, n]) => n > 0)
  .map(([s, n]) => `${n} ${s}`)
  .join(', ');
console.log(`\n${rows.length} releasable project(s): ${counts}`);
