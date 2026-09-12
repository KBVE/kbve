#!/usr/bin/env node
// Decides what ci.yml's shards run, which toolchains each has to provision,
// and how many shards there are, by asking the project graph what the change
// actually touches.
//
// Was affected-toolchains.mjs, which answered only the second half. The first
// half used to be `moon ci ':lint' ':test' ':typecheck' ':check'` in the shard,
// on the belief that the targets narrowed the run. They do not: `moon ci` runs
// every affected task carrying runInCI *and then* the explicit targets on top.
// So the lane was also running 60 `e2e` suites, 52 `container` builds and 26
// `containerx-publish` tasks -- the last of which carry
// `--cache-to=type=registry,ref=ghcr.io/...`, i.e. a registry write, on every
// pull request. Run 34279599076 died in `irc-e2e:e2e` for want of a Playwright
// browser, which is exactly the kind of failure the scoping was meant to make
// impossible.
//
// Naming the targets here instead makes the scope structural: the shards run
// `moon run <targets>`, which runs those tasks and their dependencies and
// nothing else. A task added anywhere in the workspace cannot silently join
// the lane by defaulting to runInCI.
//
// Fails open on toolchains, deliberately: every path that cannot answer
// confidently writes `true` and lets the shard install everything, because the
// cost of guessing low is a red shard that reads as a broken toolchain rather
// than as a missed detection.
//
// Does NOT fail open on the target list. An empty list means "nothing to run",
// and a detection that guessed it would report green having tested nothing --
// now by skipping the shard job outright rather than starting runners that
// find nothing to do, which makes the same wrong answer louder rather than
// quieter. A range this cannot resolve falls back to the whole graph's CI
// tasks; a moon that cannot answer at all exits non-zero, because that is a
// real break.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// The static-analysis lane. Everything else -- e2e, container, containerx,
// publish -- has a workflow of its own with the registry credentials, the
// docker daemon or the Playwright browsers it needs.
const CI_TASKS = new Set(['lint', 'test', 'typecheck', 'check']);

// The most shards to split the plan across. Fewer are used when there is less
// to run than this.
const MAX_SHARDS = 3;

// GitHub only accepts a multi-line output through a heredoc, and the delimiter
// has to be one the value cannot contain.
function emit(values) {
    const out = process.env['GITHUB_OUTPUT'];
    if (!out) return;
    let body = '';
    for (const [key, value] of Object.entries(values)) {
        body += String(value).includes('\n')
            ? `${key}<<__MOON_CI_PLAN__\n${value}\n__MOON_CI_PLAN__\n`
            : `${key}=${value}\n`;
    }
    appendFileSync(out, body);
}

// Returns the sha, or null. moon takes MOON_BASE and MOON_HEAD as refs it
// resolves itself, and the literal string "HEAD" is one it resolves to an
// empty range -- silently, as zero affected tasks, which reads exactly like a
// change that touches nothing. Both ends are passed as shas for that reason.
function sha(ref) {
    if (!ref) return null;
    try {
        return execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return null;
    }
}

// The same base moon would pick, spelled out because `moon query` takes it from
// the environment rather than detecting the CI event the way `moon ci` does.
function resolveBase() {
    const event = process.env['EVENT'] ?? '';
    const candidates = [];
    if (event === 'pull_request') {
        candidates.push(`origin/${process.env['BASE_REF'] ?? ''}`);
    }
    if (event === 'push') {
        candidates.push(process.env['BEFORE'] ?? '');
    }
    // merge_group and workflow_call, and any push whose `before` is the zero
    // sha because the branch is new.
    candidates.push('origin/dev', 'origin/main');
    for (const c of candidates) {
        const resolved = sha(c);
        if (resolved) return resolved;
    }
    return null;
}

// `null` on failure so the caller can decide whether that is fatal.
function queryTasks(range) {
    // Dependents included: an edit to a crate has to lint and test the crates
    // that consume it, not only itself.
    const args = ['query', 'tasks'];
    if (range) args.push('--affected', '--downstream', 'deep');
    try {
        const raw = execFileSync('moon', args, {
            encoding: 'utf8',
            env: range ? { ...process.env, MOON_BASE: range.base, MOON_HEAD: range.head } : process.env,
            maxBuffer: 256 * 1024 * 1024,
        });
        const parsed = JSON.parse(raw).tasks;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

const base = resolveBase();
const head = sha('HEAD');
const range = base && head ? { base, head } : null;
if (!range) console.log('no resolvable base or head ref; falling back to the whole graph');

let byProject = range ? queryTasks(range) : null;
let scoped = byProject !== null;
if (!scoped) {
    byProject = queryTasks(null);
    if (!byProject) {
        console.error('::error::moon query tasks failed; cannot decide what CI runs');
        process.exit(1);
    }
}

// The toolchains a target needs, kept per target rather than unioned, so a
// shard can be asked what *it* needs instead of what the run needs.
const needs = new Map();
for (const [project, tasks] of Object.entries(byProject)) {
    for (const [id, task] of Object.entries(tasks)) {
        if (!CI_TASKS.has(id)) continue;
        const t = new Set(task.toolchains ?? []);
        // uv projects declare `toolchain: system` and shell out, so the task
        // does not name python. The command is the only signal.
        if (String(task.command ?? '').startsWith('uv')) t.add('uv');
        needs.set(`${project}:${id}`, t);
    }
}

const targets = [...needs.keys()].sort();

// Fail open. An unscoped list is the whole graph, which needs everything, and
// a scoped one is answered from the tasks themselves.
const wants = (slice, ...names) =>
    !scoped || slice.some((t) => names.some((n) => needs.get(t).has(n)));

// One shard per slice, and no slice is empty. The matrix used to be the
// literal [0, 1, 2]: a plan with two targets still started a third runner,
// and a plan with none started three, each paying a full-history checkout,
// the apt install, the cargo cache restore and `moon setup` before printing
// that it had nothing to do. Run 34707004415 was three of those.
//
// Round-robin over the sorted list, which is what the shard's awk did, so a
// target lands on exactly one shard and the assignment is deterministic for a
// given plan. Naming the slice here rather than re-deriving it there is the
// same move the target list itself was: the shard stops deciding anything.
const total = Math.min(MAX_SHARDS, targets.length);
const shards = [];
for (let index = 0; index < total; index++) {
    const slice = targets.filter((_, i) => i % total === index);
    shards.push({
        index,
        total,
        targets: slice.join('\n'),
        // Per shard, not per run. Clearing the runner's disk for a cargo
        // target directory is two minutes, and it was being paid by all three
        // shards whenever any one of them held a rust target.
        rust: wants(slice, 'rust'),
        python: wants(slice, 'python', 'uv'),
    });
}

const union = new Set([...needs.values()].flatMap((t) => [...t]));
console.log(`base ${scoped ? base.slice(0, 12) : 'none (whole graph)'}, ${targets.length} ci target(s)`);
console.log(`toolchains: ${[...union].sort().join(', ') || 'none'}`);
for (const s of shards) {
    console.log(`shard ${s.index}/${s.total}: ${s.targets.split('\n').length} target(s), rust=${s.rust} python=${s.python}`);
    console.log(s.targets);
}
if (!shards.length) console.log('nothing affected; no shard will run');

emit({ shards: JSON.stringify(shards) });
