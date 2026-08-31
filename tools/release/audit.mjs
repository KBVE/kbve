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
//   1. Would `<project>@<its current version>` release? This runs the real
//      verify() over every project carrying a lane tag -- the same call the
//      release workflow makes -- so a lane with no version behind it, a docker
//      project whose publish task no longer names an image, or a game whose
//      ENGINE_CONFIG stopped parsing all fail here rather than on the tag.
//
//      No tag has ever been pushed in this repository, so until one is, this
//      is the only thing standing between the graph and a first release that
//      does not work. It is a dry run of all of them.
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

import { manifestVersion, lanes, verify, TagError } from './verify-tag.mjs';

// Resolved from this file rather than from cwd: manifestVersion joins the
// project source onto it, so a run from anywhere but the workspace root
// would look for every manifest in the wrong place and fail all 87.
const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const query = (args) =>
  JSON.parse(execFileSync('moon', ['query', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

// One call, and every node it returns carries its tasks -- which is what lets
// verify() below be handed a node instead of looking each one up again.
const projects = query(['projects']).projects.sort((a, b) => a.id.localeCompare(b.id));

// externalPublish resolves the factorio mod lane against this list, so a run
// without it would report every mod as publishing nothing.
const factorioMods = query(['projects', '--tags', 'factorio-mod']).projects.map((p) => p.id);

const problems = [];
let releasable = 0;
let pinned = 0;

for (const project of projects) {
  const tags = project.config.tags ?? [];
  const source = project.source;

  if (lanes(tags).length > 0) {
    try {
      // The version the tag would have to claim is the one the manifest
      // already states, so this is the tag that project would actually be
      // released under today.
      const { version } = manifestVersion(root, source);
      verify(`${project.id}@${version}`, root, factorioMods, project);
      releasable += 1;
    } catch (error) {
      if (!(error instanceof TagError)) throw error;
      problems.push(
        `${project.id} carries the ${lanes(tags).join('/')} lane but could not be released: ${error.message}`,
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
  `${releasable} releasable project(s) would release; ${pinned} deployment pin(s) exist.`,
);
