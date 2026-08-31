// Checks that a workflow calling a reusable workflow grants it at least the
// permissions it asks for.
//
// A calling job's `permissions:` block is a ceiling, not a default: every scope
// it omits is set to none for the called workflow and everything that workflow
// calls in turn. When a job down there asks for more, GitHub does not warn and
// does not fail the job -- it refuses to create the run at all, with
// `startup_failure`: no jobs, no logs, no annotation, and nothing in
// `gh run view --log-failed`. The only signal is a grey X.
//
// release.yml had this on nine of its twelve call jobs, so no release tag could
// ever have run. It went unnoticed because the repository had never pushed one,
// and because actionlint does not model the ceiling -- every file was
// individually valid.
//
// The requirement is recursive. release.yml -> ci-godot.yml -> utils-post-
// publish.yml means release.yml's godot job has to grant what utils-post-
// publish asks for, two levels down, because the ceiling is set once at the
// top and every level below inherits it.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dir = join(root, '.github', 'workflows');

const RANK = { none: 0, read: 1, write: 2 };
const higher = (a, b) => (RANK[a] ?? 0) > (RANK[b] ?? 0);

const cache = new Map();
const load = (name) => {
  if (!cache.has(name)) {
    const path = join(dir, name);
    cache.set(name, existsSync(path) ? parse(readFileSync(path, 'utf8')) : null);
  }
  return cache.get(name);
};

// `uses: ./.github/workflows/x.yml` and `uses: OWNER/REPO/.github/workflows/x.yml@ref`
// both resolve to a file in this directory; only the basename matters here.
const calleeOf = (uses) => basename(uses.split('@')[0]);

// Every permission any job in this workflow asks for, plus everything the
// workflows it calls ask for. A job with no block of its own inherits the
// workflow-level one.
function required(name, seen = new Set()) {
  if (seen.has(name)) return {};
  const workflow = load(name);
  if (!workflow) return {};
  seen.add(name);

  const out = {};
  const merge = (perms) => {
    if (!perms || typeof perms !== 'object') return;
    for (const [scope, level] of Object.entries(perms)) {
      if (higher(level, out[scope] ?? 'none')) out[scope] = level;
    }
  };

  for (const job of Object.values(workflow.jobs ?? {})) {
    merge('permissions' in job ? job.permissions : workflow.permissions);
    if (job.uses) merge(required(calleeOf(job.uses), seen));
  }
  return out;
}

const problems = [];
let checked = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.yml')).sort()) {
  const workflow = load(file);
  if (!workflow?.jobs) continue;

  for (const [jid, job] of Object.entries(workflow.jobs)) {
    if (!job.uses) continue;
    const callee = calleeOf(job.uses);
    if (!load(callee)) continue;

    checked += 1;
    const granted = ('permissions' in job ? job.permissions : workflow.permissions) ?? {};
    const needed = required(callee);
    const missing = Object.entries(needed).filter(([scope, level]) =>
      higher(level, granted?.[scope] ?? 'none'),
    );

    if (missing.length > 0) {
      problems.push(
        `${file} :: ${jid} -> ${callee}\n` +
          `      grants  ${JSON.stringify(granted)}\n` +
          `      needs   ${missing.map(([s, l]) => `${s}: ${l}`).join(', ')}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.length} reusable workflow call(s) grant less than the callee asks for.\n` +
      `GitHub refuses to start the run -- startup_failure, with no job and no log.\n\n` +
      problems.map((p) => `  ${p}`).join('\n\n'),
  );
  process.exit(1);
}

console.log(`${checked} reusable workflow call(s) grant what their callee asks for.`);
