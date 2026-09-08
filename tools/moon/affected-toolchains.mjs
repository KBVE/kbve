#!/usr/bin/env node
// Decides which toolchains ci.yml's shards have to provision, by asking the
// project graph what the change actually runs.
//
// The shards installed rust and python on every run. That is 300 of the 422
// seconds each of them spent before its first task, times three shards, on a
// change that may touch nothing but TypeScript.
//
// Keyed on affected *tasks*, not affected projects. The root project's source
// is '.', so every change affects it, and it infers rust from the workspace
// Cargo.toml -- asking about projects answers "rust" every single time. Its
// own lint and test are bash echoes, and the task list says so.
//
// Fails open, deliberately. Every path that cannot answer confidently -- an
// unresolvable base, a moon that errors, output that does not parse -- writes
// `true` and lets the shard install everything, because the cost of guessing
// low is a red shard that reads as a broken toolchain rather than as a missed
// detection.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// What ci.yml asks `moon ci` to run. A toolchain needed only by a task outside
// this set is not needed by the shards.
const CI_TASKS = new Set(['lint', 'test', 'typecheck', 'check']);

function emit(rust, python, why) {
    const out = process.env['GITHUB_OUTPUT'];
    if (out) appendFileSync(out, `rust=${rust}\npython=${python}\n`);
    console.log(`rust=${rust} python=${python} (${why})`);
}

function emitEverything(why) {
    emit(true, true, why);
    process.exit(0);
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

const base = resolveBase();
const head = sha('HEAD');
if (!base || !head) emitEverything('no resolvable base or head ref');

let raw;
try {
    raw = execFileSync(
        'moon',
        // Dependents included: `moon ci` runs them too, so an edit to a crate's
        // consumer still has to provision what the crate needs.
        ['query', 'tasks', '--affected', '--downstream', 'deep'],
        {
            encoding: 'utf8',
            env: { ...process.env, MOON_BASE: base, MOON_HEAD: head },
            maxBuffer: 256 * 1024 * 1024,
        },
    );
} catch (err) {
    emitEverything(`moon query failed: ${err.message}`);
}

let byProject;
try {
    byProject = JSON.parse(raw).tasks;
} catch (err) {
    emitEverything(`unparseable moon output: ${err.message}`);
}

if (!byProject || typeof byProject !== 'object') {
    emitEverything('moon returned no task list');
}

const toolchains = new Set();
let count = 0;
for (const [project, tasks] of Object.entries(byProject)) {
    for (const [id, task] of Object.entries(tasks)) {
        if (!CI_TASKS.has(id)) continue;
        count += 1;
        for (const t of task.toolchains ?? []) toolchains.add(t);
        // uv projects declare `toolchain: system` and shell out, so the task
        // does not name python. The project's language is the only signal.
        if (String(task.command ?? '').startsWith('uv')) toolchains.add('uv');
        void project;
    }
}

const rust = toolchains.has('rust');
const python = toolchains.has('python') || toolchains.has('uv');

console.log(`base ${base.slice(0, 12)}, ${count} affected ci task(s)`);
console.log(`toolchains: ${[...toolchains].sort().join(', ') || 'none'}`);

emit(rust, python, `${count} affected ci tasks`);
