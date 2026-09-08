#!/usr/bin/env node
// Turns a failed job's raw log into the three things a tracker issue needs: a
// headline for the title, a likely cause, and an excerpt that contains the
// error rather than the cleanup that followed it.
//
// The tracker stored `tail -50` of the log. The last fifty lines of a GitHub
// job log are the post-job region -- cache pruning, `git config --unset` for
// every credential helper, orphan process cleanup -- so the excerpt was noise
// and the title said "Failed" for every break in the repository. #16998 read
// in full as "Process completed with exit code 1", while the log two lines
// above the cut said `proto::locate::missing_executable`.
//
// Everything here is a pure function of the log text so it can be tested
// against captured logs; the workflow only pipes and formats.

import { readFileSync } from 'node:fs';

const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z\s?/;

// Tools that stamp their own output land inside the runner's stamp, and a
// wrapper that tees stdout and stderr stamps it twice more. The CodeQL
// extractor's lines reach the log as
// `[2026-09-08 21:33:09] [build-stdout] [2026-09-08 21:33:09] [build-stderr] …`
// -- 80 columns of prefix before the panic message.
const NESTED_PREFIX = /^(?:\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\]\s*|\[build-std(?:out|err)\]\s*)+/;

// A step that fails on a non-zero exit says only that. The message is true and
// carries nothing, and it is the line an annotation gives us when the log blob
// is unreadable, so it has to be recognised in both places.
const GENERIC = [
    /^Process completed with exit code \d+\.?$/,
    /^The process '.*' failed with exit code \d+$/,
    /^The operation was canceled\.$/,
    /^Error: Process completed with exit code \d+\.?$/,
];

// Post-job output, group markers, and the git plumbing every checkout unwinds.
// None of it has ever explained a failure.
const NOISE = [
    /^Post job cleanup\.?$/,
    /^##\[(group|endgroup|start-action|end-action|debug)/,
    /^\[command\]\/usr\/bin\/git /,
    /^Cleaning up orphan processes$/,
    /^Pruning is unnecessary\.$/,
    /^(Temporarily overriding HOME|Adding repository directory|Removing (SSH|HTTP|credentials|includeIf))/,
    /^git version /,
    /^\/home\/runner\/work\/_temp\/git-credentials-/,
    /^includeif\.gitdir:/,
    /^##\[warning\]Node\.js \d+ is deprecated/,
    // Panic backtraces. The frame list is the longest thing in a crashed
    // extractor's log and the shortest on explanation -- the message above it
    // is the part worth keeping, and thirty frames push it out of the excerpt.
    /^\s*\d+:\s+\S/,
    /^\s*at \/rustc\//,
    /^note: Some details are omitted/,
];

// Ordered: the first match wins, so the specific causes sit above the generic
// compiler ones. `reason` is what the issue prints as "Likely cause" and is
// meant to name the next action, not restate the error.
const CAUSES = [
    {
        id: 'lfs-auth',
        match: /Forgejo LFS auth failed|Authentication required|Authorization error|info\/lfs\/objects\/batch/i,
        headline: 'Forgejo LFS authentication failed',
        reason: 'FORGEJO_TOKEN is likely invalid or expired. Rotate the token via kube (forgejo namespace: forgejo-deploy-keys / forgejo-admin) and re-sync the FORGEJO_TOKEN GitHub secret.',
    },
    {
        id: 'toolchain-missing',
        match: /proto::locate::missing_executable/,
        headline: (log) => {
            const m = /Unable to find an executable for (\w+)/.exec(log);
            return `${m ? m[1] : 'a'} toolchain was never provisioned`;
        },
        reason: 'moon scheduled a task for a toolchain the job did not install. Either the shard skipped the preinstall step for it, or moon resolved a wider set of affected tasks than the toolchain detection did — check the `Base revision:` line against what the detect job reported.',
    },
    {
        id: 'disk-full',
        match: /No space left on device|ENOSPC/,
        headline: 'the runner ran out of disk',
        reason: 'A hosted runner has ~14GB free after the SDKs are cleared. Add the free-disk-space step to this job, or move the build to a self-hosted runner.',
    },
    {
        id: 'oom',
        match: /\bKilled\b|signal: 9, SIGKILL|exit code 137/,
        headline: 'a process was OOM-killed',
        reason: 'Exit 137 / SIGKILL is the kernel reclaiming memory, not a build error. Lower the job parallelism (cargo `-j`, jest/vitest workers) or move it to a larger runner.',
    },
    {
        id: 'codeql-extractor',
        match: /Encountered a fatal error while running .*codeql database|index-files\.sh/,
        headline: (log) => {
            const m = /panicked at [^\n]*\n(.+)/.exec(log);
            return m ? `the CodeQL extractor panicked: ${m[1].trim()}` : 'the CodeQL extractor crashed';
        },
        reason: "CodeQL's own extractor panicked while indexing, which is a scanner fault rather than a finding in the tree. Compare the CodeQL version in the log against the last green run before treating this as a code change.",
    },
    {
        id: 'rustc',
        match: /^error\[E\d+\]/m,
        headline: (log) => {
            const m = /^error(\[E\d+\]): (.+)$/m.exec(log);
            return m ? `rustc ${m[1]} ${m[2]}`.trim() : 'rustc error';
        },
    },
    {
        id: 'cargo',
        match: /^error: could not compile `([^`]+)`/m,
        headline: (log) => {
            const m = /^error: could not compile `([^`]+)`/m.exec(log);
            return `${m[1]} failed to compile`;
        },
    },
    {
        id: 'clippy',
        match: /^error: .+\n\s+--> /m,
        headline: (log) => {
            const m = /^error: (.+)$/m.exec(log);
            return `clippy: ${m[1]}`;
        },
    },
    {
        id: 'tsc',
        match: /error TS\d+:/,
        headline: (log) => {
            const n = (log.match(/error TS\d+:/g) ?? []).length;
            const m = /(\S+\(\d+,\d+\)): (error TS\d+: .+)/.exec(log);
            return n > 1 ? `${n} TypeScript errors` : m ? m[2] : 'TypeScript error';
        },
    },
    {
        id: 'docker-build',
        match: /ERROR: failed to build: failed to solve/,
        headline: 'a container build failed to solve',
    },
    {
        id: 'moon-task',
        match: /^Task (\S+) failed/m,
        headline: (log) => `${/^Task (\S+) failed/m.exec(log)[1]} failed`,
    },
];

const clean = (line) => line.replace(TIMESTAMP, '').replace(NESTED_PREFIX, '').replace(/\r$/, '');
const isNoise = (line) => NOISE.some((r) => r.test(line));
const isGeneric = (line) => GENERIC.some((r) => r.test(line.replace(/^##\[error\]/, '')));

// The excerpt ends at the failure, not at the end of the log. The anchor is the
// last `##[error]`, and the interesting lines are the ones above it.
function excerptFrom(lines, span) {
    let anchor = -1;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i].startsWith('##[error]')) {
            anchor = i;
            break;
        }
    }
    if (anchor === -1) {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            if (!isNoise(lines[i]) && lines[i].trim()) {
                anchor = i;
                break;
            }
        }
    }
    if (anchor === -1) return [];

    // A generic anchor is a pointer, not a message: keep it as the last line so
    // the exit code is visible, and spend the budget on what came before it.
    const kept = [];
    for (let i = anchor; i >= 0 && kept.length < span; i -= 1) {
        const line = lines[i];
        if (isNoise(line)) continue;
        if (!line.trim() && (!kept.length || !kept[0].trim())) continue;
        kept.unshift(line);
    }
    while (kept.length && !kept[0].trim()) kept.shift();
    return kept;
}

export function summarize(raw, { span = 30, width = 200 } = {}) {
    const lines = String(raw ?? '')
        .split('\n')
        .map(clean);
    const body = lines.join('\n');

    let headline = '';
    let reason = '';
    let cause = '';
    for (const c of CAUSES) {
        if (!c.match.test(body)) continue;
        cause = c.id;
        headline = typeof c.headline === 'function' ? c.headline(body) : c.headline;
        reason = c.reason ?? '';
        break;
    }

    const excerpt = excerptFrom(lines, span).map((l) =>
        l.length > width ? `${l.slice(0, width)}…` : l,
    );

    // Nothing matched the table, so the headline is the most specific line the
    // log offers: the last one that is neither noise nor an exit code.
    if (!headline) {
        const meaningful = [...excerpt].reverse().find((l) => l.trim() && !isGeneric(l));
        if (meaningful) {
            headline = meaningful
                .replace(/^##\[error\]/, '')
                .replace(/^Error:\s*/, '')
                .trim();
        }
    }

    return {
        cause,
        headline: headline ? trimHeadline(headline) : '',
        reason,
        excerpt: excerpt.join('\n'),
    };
}

// The title has to stay one line and stay searchable. GitHub truncates around
// 100 characters of it in a list, and the stable prefix already spends some.
function trimHeadline(text, max = 72) {
    const one = text.replace(/\s+/g, ' ').trim();
    return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

// Annotations are the fallback when the log blob is unreadable, and the only
// failure annotation a `run:` step produces is the exit code. Prefer any
// annotation that says more; report nothing rather than pretend otherwise.
export function fromAnnotations(messages) {
    const all = (messages ?? []).map((m) => String(m).trim()).filter(Boolean);
    const useful = all.filter((m) => !isGeneric(m));
    return { messages: useful.length ? useful : all, useful: useful.length > 0 };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const args = process.argv.slice(2);
    const annotations = args[0] === '--annotations';
    const file = annotations ? args[1] : args[0];
    const raw = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
    if (annotations) {
        const { messages, useful } = fromAnnotations(JSON.parse(raw));
        const note = useful
            ? ''
            : 'The job log was still being written when this was recorded, and the only annotation is the exit code. Open the run for the real error.';
        const text = messages.join('\n') || 'Log unavailable.';
        process.stdout.write(note ? `${text}\n\n${note}\n` : `${text}\n`);
    } else {
        process.stdout.write(JSON.stringify(summarize(raw), null, 2));
    }
}
