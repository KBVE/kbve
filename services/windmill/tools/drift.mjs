// Fails when the Windmill instance holds something the repo does not.
//
// `wmill sync pull --dry-run` prints what it would change but always exits 0,
// so it cannot gate a build on its own. Pulling for real and then asking git
// whether anything moved uses a source of truth that does not depend on
// parsing CLI output.
//
// Run this in CI on a clean checkout. Locally it will report your own
// uncommitted work under f/, which is the same signal by a different cause.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file rather than from cwd: moon runs the task with the
// project as the working directory, but a `node services/windmill/tools/...`
// from the repo root would otherwise match nothing under f/ and pass without
// having checked anything.
const project = dirname(dirname(fileURLToPath(import.meta.url)));
const scripts = join(project, 'f');

const version = process.env.WMILL_CLI_VERSION;
const workspace = process.env.WMILL_WORKSPACE;

if (!version || !workspace) {
  console.error('WMILL_CLI_VERSION and WMILL_WORKSPACE must be set. Run this through moon.');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

try {
  execFileSync(
    npx,
    ['--yes', `windmill-cli@${version}`, 'sync', 'pull', '--workspace', workspace, '--yes'],
    { stdio: 'inherit', cwd: project },
  );
} catch (error) {
  console.error('wmill sync pull failed. Is the workspace configured with a token?');
  process.exit(error.status ?? 1);
}

const changed = execFileSync('git', ['status', '--porcelain', '--', scripts], {
  encoding: 'utf8',
  cwd: project,
}).trim();

if (changed) {
  console.error(
    'The Windmill instance is ahead of the repository:\n' +
      changed +
      '\n\nSomeone edited in the UI. Commit this pull rather than pushing over it.',
  );
  process.exit(1);
}

console.log('No drift: the repository matches the instance.');
