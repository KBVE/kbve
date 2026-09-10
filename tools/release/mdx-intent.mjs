// A version bump in a project doc is a release request.
//
// Releasing by tag means knowing that a tag is `<project>@<semver>`, that the
// project id is a moon node id rather than the doc's filename, and that the
// version has to be one the manifest can be moved to. Bumping `version:` in
// docs/project/<name>.mdx asks for the same thing in the terms someone already
// has open, and this turns that request into the tag the release runs on.
//
// It publishes nothing. The tag it pushes is the same tag a person would push
// by hand, so both routes converge on release.yml immediately and there is one
// release path to reason about rather than two.
//
// The firing rule is that the doc's `version:` CHANGED in this push. It is not
// "the doc is ahead of the newest tag": five tags exist across ninety-two
// releasable projects, so absence of a tag says the migration is young, not
// that a release is due -- reading it as intent would fire thirty-nine releases
// the first time this ran, for projects whose doc and manifest already agree.
// A changed line, by contrast, is someone saying so.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { compareSemver, frontmatterField, lanes, TagError } from './verify-tag.mjs';

/** Every project doc lives here; the trigger watches this one directory. */
export const DOC_DIR = 'docs/project';

/**
 * Why a doc was passed over.
 *
 * Skips are reported rather than silently dropped: a doc that names a project
 * nothing can release is a typo in the doc, and staying quiet about it is how
 * someone bumps a version, sees a green run and assumes it shipped.
 */
export const SKIP = {
	NO_VERSION: 'no version: in frontmatter',
	NO_APP_NAME: 'no app_name: in frontmatter',
	UNCHANGED: 'version: did not change in this push',
	NEW_DOC: 'doc added in this push -- bump it to release',
	NOT_A_PROJECT: 'app_name does not name a moon project',
	NO_LANE: 'project carries no release lane tag',
	BACKWARDS: 'version: moved backwards',
	TAG_EXISTS: 'that tag already exists',
};

/**
 * What one doc asks for, given its content before and after a push.
 *
 * `before` is null when the file is new. Returns either a tag to push or the
 * reason it was passed over, never a bare boolean, so the caller can say what
 * it did with every file it was handed.
 */
export function intentFor(after, before, { projects, existingTags }) {
	const version = frontmatterField(after, 'version');
	if (!version) return { skip: SKIP.NO_VERSION };

	const project = frontmatterField(after, 'app_name');
	if (!project) return { skip: SKIP.NO_APP_NAME };

	// The bump itself is the request. A doc edited for its prose, its sidebar
	// or its tags must not ship anything, and on a repo with almost no tags
	// that is the only signal that separates the two.
	//
	// A doc this push ADDED is not a bump. It carries whatever version it was
	// written with, and that is as true of a genuinely new project as it is of
	// a file that moved: the migration of these docs out of astro-kbve into
	// docs/project/ presented all 127 as new at once, and reading a version
	// out of them would have asked for forty releases for a `git mv`. Whoever
	// adds a doc can bump it afterwards, which is one commit and unambiguous.
	if (before === null) return { skip: SKIP.NEW_DOC, project, version };

	const previous = frontmatterField(before, 'version');
	if (previous === version) return { skip: SKIP.UNCHANGED, project };

	// A doc whose version went backwards is being reverted, not released.
	if (previous !== null && compareSemver(version, previous) < 0) {
		return { skip: SKIP.BACKWARDS, project, version, previous };
	}

	const node = projects.get(project);
	if (!node) return { skip: SKIP.NOT_A_PROJECT, project };
	if (lanes(node.config?.tags ?? []).length === 0) {
		return { skip: SKIP.NO_LANE, project };
	}

	// The tag route's own sync writes the doc forward after a release, and that
	// commit lands on dev like any other. Without this the write-back would
	// look like a fresh bump and tag the version a second time -- the two doors
	// would push each other in a loop.
	const tag = `${project}@${version}`;
	if (existingTags.has(tag)) return { skip: SKIP.TAG_EXISTS, project, version, tag };

	return { tag, project, version, previous };
}

/** The moon project graph, keyed by id. */
export function projectMap(cwd = process.cwd()) {
	const out = execFileSync('moon', ['query', 'projects'], {
		cwd,
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024,
	});
	return new Map(JSON.parse(out).projects.map((p) => [p.id, p]));
}

/** Every tag that already exists, so a release is never requested twice. */
export function tagSet(cwd = process.cwd()) {
	const out = execFileSync('git', ['tag', '--list'], { cwd, encoding: 'utf8' });
	return new Set(out.split('\n').filter(Boolean));
}

/** A file's content at a commit, or null when it did not exist there. */
export function blobAt(ref, path, cwd = process.cwd()) {
	try {
		return execFileSync('git', ['show', `${ref}:${path}`], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		});
	} catch {
		return null;
	}
}

/** Project docs touched between two commits. */
export function changedDocs(base, head, cwd = process.cwd()) {
	const out = execFileSync('git', ['diff', '--name-only', `${base}..${head}`, '--', DOC_DIR], {
		cwd,
		encoding: 'utf8',
	});
	return out
		.split('\n')
		.filter((line) => line.endsWith('.mdx'))
		.filter(Boolean);
}

/**
 * Every release the docs changed in this push are asking for.
 *
 * Reads each doc at both ends of the push rather than trusting the diff text,
 * so a reformat that moves the line without changing the value is not a bump.
 */
export function resolveIntents(base, head, cwd = process.cwd()) {
	const projects = projectMap(cwd);
	const existingTags = tagSet(cwd);
	const results = [];
	for (const path of changedDocs(base, head, cwd)) {
		const after = blobAt(head, path, cwd);
		// Deleted in this push: nothing to release.
		if (after === null) continue;
		const before = blobAt(base, path, cwd);
		results.push({ path, ...intentFor(after, before, { projects, existingTags }) });
	}
	return results;
}

function main() {
	const [base, head] = process.argv.slice(2);
	if (!base || !head) {
		console.error('usage: mdx-intent.mjs <base-sha> <head-sha>');
		process.exit(2);
	}

	let results;
	try {
		results = resolveIntents(base, head);
	} catch (error) {
		if (error instanceof TagError) {
			console.error(`::error::${error.message}`);
			process.exit(1);
		}
		throw error;
	}

	const tags = [];
	for (const r of results) {
		if (r.tag && !r.skip) {
			tags.push(r.tag);
			console.log(`${r.path}: ${r.previous ?? 'new'} -> ${r.version}, tagging ${r.tag}`);
		} else {
			console.log(`${r.path}: skipped -- ${r.skip}`);
		}
	}

	// A doc that names a project nothing can release is worth a CI annotation:
	// the bump looks done to whoever made it, and nothing would ever ship.
	for (const r of results) {
		if (r.skip === SKIP.NOT_A_PROJECT || r.skip === SKIP.NO_LANE) {
			console.log(`::warning file=${r.path}::${r.path}: ${r.skip} (${r.project})`);
		}
	}

	if (process.env.GITHUB_OUTPUT) {
		appendFileSync(process.env.GITHUB_OUTPUT, `tags=${JSON.stringify(tags)}\n`);
	}
	if (tags.length === 0) console.log('no release requested by this push');
}

if (process.argv[1] && process.argv[1].endsWith('mdx-intent.mjs')) main();
