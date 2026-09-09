import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { fromAnnotations, summarize, summarizeAnnotations } from './failure-summary.mjs';

const ts = (i) => `2026-09-08T21:43:${String(i).padStart(2, '0')}.0000000Z `;
const log = (...lines) => lines.map((l, i) => ts(i) + l).join('\n');

// The shape of run 34281544535, which opened #16998 saying only
// "Process completed with exit code 1".
const TOOLCHAIN = log(
    '##[group]Building action graph',
    'Base revision: N/A',
    'Head revision: HEAD',
    'Resolved targets: 1',
    '\tmmorpg:test',
    '##[endgroup]',
    '▮▮▮▮ kinetree:build (9a6c6f90)',
    'Error: proto::locate::missing_executable',
    '',
    '  × Unable to find an executable for Rust, expected file ~/.rustup/',
    '  │ toolchains/1.98.0-x86_64-unknown-linux-gnu/bin/cargo does not exist.',
    '',
    '##[error]Process completed with exit code 1.',
    'Post job cleanup.',
    '[command]/usr/bin/git version',
    'git version 2.55.0',
    'Removing SSH command configuration',
    'Cleaning up orphan processes',
);

test('names the missing toolchain instead of the exit code', () => {
    const { cause, headline, reason, excerpt } = summarize(TOOLCHAIN);
    assert.equal(cause, 'toolchain-missing');
    assert.equal(headline, 'Rust toolchain was never provisioned');
    assert.match(reason, /toolchain the job did not install/);
    assert.match(excerpt, /proto::locate::missing_executable/);
});

test('keeps the lines above the error and drops the cleanup below it', () => {
    const { excerpt } = summarize(TOOLCHAIN);
    assert.match(excerpt, /kinetree:build/);
    assert.match(excerpt, /Base revision: N\/A/);
    assert.doesNotMatch(excerpt, /Post job cleanup/);
    assert.doesNotMatch(excerpt, /orphan processes/);
    assert.doesNotMatch(excerpt, /git version/);
    assert.doesNotMatch(excerpt, /##\[group\]/);
});

test('the exit code stays as the last line, since it is the anchor', () => {
    const { excerpt } = summarize(TOOLCHAIN);
    assert.equal(excerpt.trim().split('\n').pop(), '##[error]Process completed with exit code 1.');
});

// The CodeQL extractor stamps its own output inside the runner's stamp and
// then again per stream, and follows the panic with thirty backtrace frames.
const CODEQL = log(
    '[2026-09-08 21:33:09] [build-stdout] [2026-09-08 21:33:09] [build-stderr] thread \'main\' (2553) panicked at external/ra_ap_base_db/src/lib.rs:104:17:',
    '[2026-09-08 21:33:09] [build-stdout] [2026-09-08 21:33:09] [build-stderr] Unable to fetch file text for `vfs::FileId`: FileId(37230); this is a bug',
    '[2026-09-08 21:33:09] [build-stdout] [2026-09-08 21:33:09] [build-stderr] stack backtrace:',
    '[2026-09-08 21:33:10] [build-stdout] [2026-09-08 21:33:10] [build-stderr]   11: ra_ap_hir_expand::db::ast_id_map',
    '[2026-09-08 21:33:10] [build-stdout] [2026-09-08 21:33:10] [build-stderr]   12: ra_ap_hir_def::item_tree::file_item_tree_query',
    '[2026-09-08 21:33:10] [build-stdout] [2026-09-08 21:33:10] [build-stderr]              at /rustc/da80ed07/library/std/src/panicking.rs:679:5',
    '[2026-09-08 21:33:10] [build-stdout] [2026-09-08 21:33:10] [build-stderr] note: Some details are omitted, run with `RUST_BACKTRACE=full` for a verbose backtrace.',
    'A fatal error occurred: Exit status 2 from command: [codeql/rust/tools/autobuild.sh]',
    '##[error]Encountered a fatal error while running "codeql database trace-command". Exit code was 2.',
);

test('lifts the panic message out of the backtrace', () => {
    const { cause, headline, excerpt } = summarize(CODEQL);
    assert.equal(cause, 'codeql-extractor');
    assert.match(headline, /^the CodeQL extractor panicked: Unable to fetch file text/);
    assert.match(excerpt, /this is a bug/);
    assert.doesNotMatch(excerpt, /ast_id_map/);
    assert.doesNotMatch(excerpt, /at \/rustc\//);
    assert.doesNotMatch(excerpt, /details are omitted/);
});

test('collapses the nested timestamp and stream prefixes', () => {
    const { excerpt } = summarize(CODEQL);
    assert.doesNotMatch(excerpt, /\[build-stdout\]/);
    assert.match(excerpt, /^Unable to fetch file text/m);
});

test('falls back to the last meaningful line when nothing matches', () => {
    const { cause, headline } = summarize(
        log('Running suite', 'assert.equal(1, 2) did not hold', '##[error]Process completed with exit code 1.'),
    );
    assert.equal(cause, '');
    assert.equal(headline, 'assert.equal(1, 2) did not hold');
});

test('reports no headline when the log says nothing but the exit code', () => {
    assert.equal(summarize(log('##[error]Process completed with exit code 1.')).headline, '');
});

test('survives an empty or missing log', () => {
    for (const input of ['', null, undefined]) {
        const out = summarize(input);
        assert.equal(out.headline, '');
        assert.equal(out.excerpt, '');
    }
});

test('a headline stays on one line and within the title budget', () => {
    const { headline } = summarize(log('Error: ' + 'x'.repeat(400), '##[error]Process completed with exit code 1.'));
    assert.ok(headline.length <= 72, headline.length);
    assert.doesNotMatch(headline, /\n/);
});

test('rustc and tsc errors are named by what failed', () => {
    assert.equal(
        summarize(log('error[E0432]: unresolved import `foo::bar`', '##[error]Process completed with exit code 1.')).headline,
        'rustc [E0432] unresolved import `foo::bar`',
    );
    assert.equal(
        summarize(log('src/a.ts(3,9): error TS2322: Type mismatch', 'src/b.ts(4,1): error TS2304: Cannot find name', '##[error]x')).headline,
        '2 TypeScript errors',
    );
});

test('an OOM kill is not read as a build error', () => {
    const { cause, reason } = summarize(log('cc: fatal error', 'make: *** [all] Error 137', 'Command exited with exit code 137', '##[error]Process completed with exit code 137.'));
    assert.equal(cause, 'oom');
    assert.match(reason, /SIGKILL/);
});

test('annotations prefer anything over the exit code', () => {
    assert.deepEqual(fromAnnotations(['Process completed with exit code 1.']), {
        messages: ['Process completed with exit code 1.'],
        useful: false,
    });
    assert.deepEqual(
        fromAnnotations(['Process completed with exit code 1.', 'moon: kinetree:build failed']),
        { messages: ['moon: kinetree:build failed'], useful: true },
    );
});

// The shape of run 34306307960, which opened #17013 as `[CI] CI / ci — Failed`
// with no idea which of a hundred tasks broke.
const MOON = log(
    'astro-kbve:build | src/a.ts(3,9): error TS2322: Type mismatch',
    'pass RunTask(kbve:test) (3m 53s 119ms, d76a25fc)',
    'pass RunTask(simgrid:build) (11m 8s 500ms, a2c202b0)',
    'skip RunTask(axum-kbve:test) (skipped, 2ms)',
    'fail RunTask(astro-kbve:build) (4m 11s 420ms, bdf8b5c8)',
    ' STATS ',
    'Actions: 112 completed, 1 failed, 8 skipped',
    '   Time: 57m 26s 110ms',
    '##[error]Process completed with exit code 1.',
);

test('the title names the moon target that failed', () => {
    const { targets, headline } = summarize(MOON);
    assert.deepEqual(targets, ['astro-kbve:build']);
    assert.equal(headline, 'astro-kbve:build: error TS2322: Type mismatch');
});

test('a hundred passing tasks do not crowd the failing one out of the excerpt', () => {
    const { excerpt } = summarize(MOON);
    assert.match(excerpt, /fail RunTask\(astro-kbve:build\)/);
    assert.match(excerpt, /error TS2322/);
    assert.doesNotMatch(excerpt, /pass RunTask/);
    assert.doesNotMatch(excerpt, /skip RunTask/);
    assert.doesNotMatch(excerpt, /Actions: 112 completed/);
});

test('several failed targets are named without spending the whole title', () => {
    const { headline } = summarize(
        log(
            'fail RunTask(a:lint) (1s, 1)',
            'fail RunTask(b:test) (1s, 2)',
            'fail RunTask(c:build) (1s, 3)',
            '##[error]Process completed with exit code 1.',
        ),
    );
    assert.equal(headline, 'a:lint, b:test +1 more failed');
    assert.ok(headline.length <= 72);
});

test('a target with no other clue still beats the exit code', () => {
    assert.equal(
        summarize(log('fail RunTask(q:test) (1s, 1)', '##[error]Process completed with exit code 1.')).headline,
        'q:test failed',
    );
});

test('annotations carry a headline when they say more than the exit code', () => {
    assert.equal(
        summarizeAnnotations(['Process completed with exit code 1.', 'moon: kinetree:build failed']).headline,
        'moon: kinetree:build failed',
    );
    const bare = summarizeAnnotations(['Process completed with exit code 1.']);
    assert.equal(bare.headline, '');
    assert.match(bare.excerpt, /still being written/);
});

// Run 34306307960 in miniature: two failing tasks, one of which prints a line
// per page and would otherwise be the whole excerpt.
const TWO_TARGETS = log(
    'guards:lint | Cargo.workspace.toml stubs out of sync with the root workspace tables:',
    'guards:lint | Run: python3 tools/guards/sync-cargo-workspace-stubs.py',
    ...Array.from({ length: 80 }, (_, i) => `astro-kbve:build |   ├─ /page-${i}/index.html (+3ms)`),
    'astro-kbve:build | [ERROR] [build] Caught error: Cannot find native binding.',
    'astro-kbve:build |     at async file:///home/runner/work/kbve/kbve/chunks/common.mjs:12851:74',
    'fail RunTask(guards:lint) (531ms, 394b463e)',
    'fail RunTask(astro-kbve:build) (3m 23s 555ms, bdf8b5c8)',
    '##[error]Process completed with exit code 1.',
);

test('both failing tasks reach the excerpt, however loud one of them is', () => {
    const { excerpt, headline, cause } = summarize(TWO_TARGETS);
    assert.equal(cause, 'native-binding');
    assert.equal(headline, 'guards:lint, astro-kbve:build: a native binding was missing at runtime');
    assert.match(excerpt, /Cargo.workspace.toml stubs out of sync/);
    assert.match(excerpt, /Cannot find native binding/);
    assert.doesNotMatch(excerpt, /at async file:/);
});

test('a passing task does not get to decide the headline', () => {
    const { cause, headline } = summarize(
        log(
            'kbve:test | test error::tests::rustc_error_E0432_is_reported ... ok',
            'kbve:test | error[E0432]: this string lives in a passing test name',
            'guards:lint | Cargo.workspace.toml stubs out of sync',
            'fail RunTask(guards:lint) (531ms, 394b463e)',
            '##[error]Process completed with exit code 1.',
        ),
    );
    assert.equal(cause, '');
    assert.equal(headline, 'guards:lint: Cargo.workspace.toml stubs out of sync');
});

test('many long target names give the title back to the error', () => {
    const targets = [
        'memes-e2e:e2e',
        'astro-cryptothrone-e2e:e2e-docker',
        'discordsh-web-e2e:e2e',
        'irc-e2e:e2e',
    ];
    const { headline, cause } = summarize(
        log(
            "memes-e2e:e2e | Error: browserType.launch: Executable doesn't exist at /home/runner/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell",
            ...targets.map((t) => `fail RunTask(${t}) (1s, 1)`),
            '##[error]Process completed with exit code 1.',
        ),
    );
    assert.equal(cause, 'playwright-browser');
    assert.equal(headline, 'memes-e2e:e2e +3 more: a Playwright browser was never installed');
    assert.ok(headline.length <= 72);
});
