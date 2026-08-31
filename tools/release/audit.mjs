// Checks that every project a tag could name is actually releasable, before
// anyone pushes the tag.
//
// Under the dispatch manifest a release was a hand-maintained list, and the way
// you found out an entry had gone stale was a release that silently did
// nothing. The tag scheme moved all of that onto the project graph, which is a
// better source but not a self-checking one: a project can carry the `crates`
// lane tag with no version anywhere, or pin a deployment at a kube manifest
// that was renamed six months ago, and both look fine until the tag is pushed.
//
// Two questions, asked of the whole graph:
//
//   1. Does every project carrying a lane tag have a version this can read?
//      Without one, `<project>@<semver>` fails verify-tag at release time.
//
//   2. Does every path in KUBE_DEPLOYMENT_YAMLS exist? A release with a stale
//      pin reaches the registry and never reaches the cluster -- ArgoCD keeps
//      deploying whatever tag the manifest it did not update still names. That
//      is the exact failure the manifest's 55 stale paths produced, and it is
//      invisible in a green release run.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { manifestVersion, lanes, TagError } from './verify-tag.mjs';

// Resolved from this file rather than from cwd: manifestVersion joins the
// project source onto it, so a run from anywhere but the workspace root
// would look for every manifest in the wrong place and fail all 87.
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const projects = JSON.parse(
  execFileSync('moon', ['query', 'projects'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
).projects.sort((a, b) => a.id.localeCompare(b.id));

const problems = [];
let releasable = 0;
let pinned = 0;

for (const project of projects) {
  const tags = project.config.tags ?? [];
  const source = project.source;

  if (lanes(tags).length > 0) {
    try {
      manifestVersion(root, source);
      releasable += 1;
    } catch (error) {
      if (!(error instanceof TagError)) throw error;
      problems.push(
        `${project.id} carries the ${lanes(tags).join('/')} lane but has no version: ${error.message}`,
      );
    }
  }

  // Not gated on the lane: the pin is read by the publish workflows, and a
  // project that carries one has already decided it deploys somewhere.
  const declared = project.config.env?.KUBE_DEPLOYMENT_YAMLS;
  if (!declared) continue;

  let paths;
  try {
    paths = JSON.parse(declared);
  } catch {
    problems.push(`${project.id} has a KUBE_DEPLOYMENT_YAMLS that is not JSON: ${declared}`);
    continue;
  }

  for (const path of paths) {
    if (existsSync(join(root, path))) {
      pinned += 1;
      continue;
    }
    problems.push(`${project.id} pins a deployment at ${path}, which does not exist.`);
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.length} release problem(s):\n` + problems.map((p) => `  ${p}`).join('\n'),
  );
  process.exit(1);
}

console.log(
  `${releasable} releasable project(s) resolve a version; ${pinned} deployment pin(s) exist.`,
);
