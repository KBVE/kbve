import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { fromAnnotations, summarize } from './failure-summary.mjs';

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
