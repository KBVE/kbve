#!/usr/bin/env node
// Release notes for one project, out of the commits that actually shipped in it.
//
// GitHub's generated notes diff against the chronologically previous tag, which
// in a monorepo interleaves every other project: the range between
// rentearth-bevy@0.1.0 and @0.1.1 carries gilded-gazette and kbve-py commits
// that were never in the artifact. That is why notes were written by hand.
//
// Two things this repository already has make them computable instead. Every
// commit is a conventional commit with a scope (the commit-msg hook enforces
// it), and moon knows where every project's source lives. So the previous tag
// is the previous tag *for this project*, and membership in the range is a
// pathspec against the project's source.
//
// Path is truth, scope is presentation. A commit ships in the artifact if it
// touched the project's files, whatever its scope says --
// `perf(ci): keep the compiled browser build between runs` belongs in the game's
// notes when it changed the game's build. The scope only decides which heading
// the line lands under, and is printed when it names something other than this
// project, because then it is telling the reader something.
//
// Usage: notes.mjs <project>@<version>          write notes to stdout

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { projectNode, parseTag, TagError } from './verify-tag.mjs';

// Field and record separators. A commit body is multi-line and may contain any
// printable character, so the delimiters have to be ones git will never emit
// from the message itself.
const FS = '\x1f';
const RS = '\x1e';

/**
 * Splits a semver into comparable parts. Not a full spec implementation: build
 * metadata is ignored (semver says it never affects precedence) and anything
 * unparseable sorts last, so a malformed tag cannot silently become "newest"
 * and swallow a whole release's commits into one entry.
 */
export function semverParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
  if (!match) return null;
  const [, major, minor, patch, prerelease] = match;
  return {
    core: [Number(major), Number(minor), Number(patch)],
    prerelease: prerelease === undefined ? null : prerelease.split('.'),
  };
}

/** Negative when a sorts before b. Unparseable versions sort before parseable. */
export function compareSemver(a, b) {
  const pa = semverParts(a);
  const pb = semverParts(b);
  if (!pa && !pb) return a < b ? -1 : a > b ? 1 : 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }
  // A release outranks any of its prereleases: 1.0.0 is newer than 1.0.0-rc.1.
  if (!pa.prerelease && !pb.prerelease) return 0;
  if (!pa.prerelease) return 1;
  if (!pb.prerelease) return -1;
  for (let i = 0; i < Math.max(pa.prerelease.length, pb.prerelease.length); i++) {
    const x = pa.prerelease[i];
    const y = pb.prerelease[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    // Numeric identifiers always have lower precedence than alphanumeric ones.
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * The tag this project was released at before `version`.
 *
 * Matching is on the exact `<project>@` prefix, so `rentearth-bevy@0.1.0` is a
 * candidate for `rentearth-bevy` and `rentearth-bevy-tools@0.1.0` is not. Tags
 * at or above the version being released are skipped rather than sorted around:
 * re-running the generator for an older tag should produce that tag's notes,
 * not notes reaching back from the newest one.
 *
 * Returns null for a first release; the caller reads from the root commit.
 */
export function previousTag(allTags, project, version) {
  const prefix = `${project}@`;
  const earlier = allTags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => ({ tag, version: tag.slice(prefix.length) }))
    .filter((entry) => compareSemver(entry.version, version) < 0)
    .sort((a, b) => compareSemver(a.version, b.version));
  return earlier.length ? earlier[earlier.length - 1].tag : null;
}

/**
 * Pulls the conventional-commit parts out of a subject. Returns nulls for a
 * subject that is not one rather than throwing: two such commits predate the
 * hook, and dropping them from the notes would be a silent hole in the history.
 */
export function parseSubject(subject) {
  const match = /^([a-z]+)(?:\(([^)]+)\))?(!)?: (.+)$/.exec(subject);
  if (!match) return { type: null, scope: null, breaking: false, text: subject };
  const [, type, scope, bang, text] = match;
  return { type, scope: scope ?? null, breaking: bang === '!', text };
}

// Where each conventional type is reported. Types come from the `commit` fields
// in tools/labels/labels.yml; anything absent here (or unparseable) falls to
// Internal, so a type added there still appears in the notes without an edit.
const SECTIONS = [
  { heading: 'Breaking changes', types: [] },
  { heading: 'Features', types: ['feat', 'content'] },
  { heading: 'Fixes', types: ['fix'] },
  { heading: 'Performance', types: ['perf'] },
  { heading: 'Documentation', types: ['docs'] },
  { heading: 'Internal', types: null },
];

/** The heading a commit belongs under. Breaking wins over its own type. */
export function section(commit) {
  if (commit.breaking) return 'Breaking changes';
  const found = SECTIONS.find((s) => s.types?.includes(commit.type));
  return found ? found.heading : 'Internal';
}

/**
 * The commit that only exists to carry the version bump. It says nothing a
 * reader of the release notes does not already know from the heading, and it is
 * in every release, so it is dropped rather than filed under Internal.
 */
export function isVersionBump(commit, project, version) {
  if (commit.type !== 'chore' && commit.type !== 'release') return false;
  if (commit.scope !== project) return false;
  return commit.text.trim() === version;
}

/** `- text (`abc1234`)`, with the scope shown only when it adds something. */
export function bullet(commit, project) {
  const scope =
    commit.scope && commit.scope !== project ? `**${commit.scope}:** ` : '';
  return `- ${scope}${commit.text} (\`${commit.sha.slice(0, 7)}\`)`;
}

export function render({ project, version, tag, previous, commits, repo }) {
  const lines = [`## ${project} ${version}`, ''];

  const kept = commits.filter((c) => !isVersionBump(c, project, version));
  if (!kept.length) {
    lines.push(
      previous
        ? `No changes to \`${project}\` since ${previous}.`
        : `First release of \`${project}\`.`,
      '',
    );
  }

  for (const { heading } of SECTIONS) {
    const inSection = kept.filter((c) => section(c) === heading);
    if (!inSection.length) continue;
    lines.push(`### ${heading}`, '');
    for (const commit of inSection) lines.push(bullet(commit, project));
    lines.push('');
  }

  if (repo && previous) {
    lines.push(
      `**Full changelog**: https://github.com/${repo}/compare/${previous}...${tag}`,
      '',
    );
  }
  return lines.join('\n');
}

// --- everything below touches git or the environment ---

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Whether git can resolve a ref, without the failure being fatal. */
export function refExists(ref, cwd = process.cwd()) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Commits in the range that touched the project's source.
 *
 * `--no-merges` because a merge commit's subject is exempt from the convention
 * and its content is already listed as the commits it brought in.
 */
export function commitsFor(range, source, cwd = process.cwd()) {
  const out = git(
    ['log', '--no-merges', `--format=%H${FS}%s${RS}`, range, '--', source],
    cwd,
  );
  return out
    .split(RS)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject] = record.split(FS);
      return { sha, subject, ...parseSubject(subject) };
    });
}

/**
 * `owner/name` for the compare link. The workflow sets GITHUB_REPOSITORY; the
 * remote is the fallback so the script is useful when run by hand.
 */
export function repoSlug(cwd = process.cwd()) {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = git(['config', '--get', 'remote.origin.url'], cwd).trim();
    const match = /github\.com[:/](.+?)(?:\.git)?$/.exec(url);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function notes(tag, cwd = process.cwd()) {
  const { project, version } = parseTag(tag);
  // Only the source path, not verify(). verify() compares the tag against the
  // manifest in the working tree, which is right for the release workflow --
  // checked out at the tag -- and wrong here: regenerating the notes for an
  // older tag from a current checkout would fail on a version disagreement
  // that is not a mistake. The workflow still runs verify before this.
  const resolved = projectNode(project, cwd);
  const allTags = git(['tag', '--list'], cwd).split('\n').map((t) => t.trim()).filter(Boolean);
  const previous = previousTag(allTags, project, version);
  // Previewing the notes for a tag that has not been created yet is the useful
  // thing to do before creating it, and `git log <missing-ref>` is a fatal
  // error rather than an empty range. HEAD is what that tag would point at, so
  // the preview is the real answer. Said on stderr so stdout stays a clean
  // notes file when it is redirected.
  let head = tag;
  if (!refExists(tag, cwd)) {
    head = 'HEAD';
    process.stderr.write(
      `${tag} does not exist yet; showing the notes it would get from HEAD.\n`,
    );
  }
  const range = previous ? `${previous}..${head}` : head;
  const commits = commitsFor(range, resolved.source, cwd);
  return render({
    project,
    version,
    tag,
    previous,
    commits,
    repo: repoSlug(cwd),
  });
}

function main() {
  const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
  if (!tag) {
    console.error('Usage: node tools/release/notes.mjs <project>@<version>');
    process.exit(2);
  }
  try {
    process.stdout.write(notes(tag));
  } catch (error) {
    if (error instanceof TagError) {
      console.error(`::error::${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
