// Checks that no workflow writes down a toolchain version that .prototools or
// package.json already owns.
//
// Every workflow used to set these itself: `node-version: 24` in seventeen
// files, `version: 11.15.0` for pnpm in thirteen. A pin copied that many times
// is not a pin, it is a rumour -- ci-react-native-ios.yml said node 20 while
// .prototools said 24.10.0, and the symptom of that is a workflow that fails on
// a syntax the other seventeen accept.
//
// .github/actions/setup-js and setup-moon read the real thing, so a workflow
// naming a version now is either bypassing them or about to drift from them.
//
// node and pnpm only. Four workflows also pin `python-version: 3.14` on
// actions/setup-python, and .prototools deliberately pins uv rather than the
// interpreter -- uv resolves that from each project's .python-version. Two of
// the four pair setup-python with setup-uv and then run `uv sync`, where the
// pin is the same second claim this rejects for node. The third runs plain
// python and needs it. That is a judgement about three workflows rather than a
// rule, so it is not enforced here.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const dir = join(root, '.github', 'workflows');

const prototools = readFileSync(join(root, '.prototools'), 'utf8');
const owned = Object.fromEntries(
  [...prototools.matchAll(/^(\w+)\s*=\s*"([^"]+)"$/gm)].map((m) => [m[1], m[2]]),
);
const packageManager = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).packageManager;

// `uses:` pins are a different thing -- an action's own tag -- and dependabot
// owns those. This is only about language runtimes.
const RULES = [
  {
    // `node-version:` anywhere, except inside the action that reads the pin.
    pattern: /^\s*node-version:\s*['"]?([\d.x]+)['"]?\s*$/gm,
    say: (v) => `sets node-version: ${v}. .prototools says node ${owned.node}; use ./.github/actions/setup-js.`,
  },
];

const problems = [];

for (const file of readdirSync(dir).filter((f) => f.endsWith('.yml')).sort()) {
  const text = readFileSync(join(dir, file), 'utf8');

  for (const { pattern, say } of RULES) {
    for (const match of text.matchAll(pattern)) {
      problems.push(`${file}: ${say(match[1])}`);
    }
  }

  // pnpm's version lives in package.json's `packageManager`, which
  // pnpm/action-setup reads when given no version of its own.
  const workflow = parse(text);
  for (const [jid, job] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (typeof step?.uses === 'string' && step.uses.startsWith('pnpm/action-setup') && step.with?.version) {
        problems.push(
          `${file} :: ${jid} pins pnpm ${step.with.version}. package.json says ${packageManager}; ` +
            `drop the version and action-setup reads it.`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.length} workflow toolchain pin(s) duplicate a version that is owned elsewhere:\n` +
      problems.map((p) => `  ${p}`).join('\n'),
  );
  process.exit(1);
}

console.log(`No workflow duplicates a toolchain version. node ${owned.node}, ${packageManager}.`);
