// Builds the deploy matrix for .github/workflows/deploy.yml from the project
// graph, so adding a service is a moon.yml rather than a workflow.
//
// A service opts in with `tags: ['service']` and a `ship` task. `ship` rather
// than `deploy` because `deploy` is already taken across the repository for
// running a container locally -- irc-gateway:deploy binds port 4321 on your
// laptop -- and a lane that shipped to production under a verb that means
// something else here is a mistake waiting for whoever reads it next.
//
// Two optional pieces, both read off the project:
//
//   env.DEPLOY_RUNNER   the runs-on label. Defaults to ubuntu-latest; windmill
//                       sets an in-cluster runner because the API it talks to
//                       is ClusterIP-only.
//   a `configure` task  credential setup that has to happen before ship, and
//                       that a laptop should not be forced through on every
//                       `moon run windmill:check`. The lane runs it when the
//                       project defines one.
//
// --check validates the same rules without emitting anything, and runs as this
// project's lint task, so a service tagged but never wired up fails in CI
// rather than at 2am on a push to main.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const check = process.argv.includes('--check');
const only = process.argv.find((arg) => arg.startsWith('--project='))?.split('=')[1];

const moon = process.platform === 'win32' ? 'moon.cmd' : 'moon';

const query = (args) =>
  JSON.parse(execFileSync(moon, ['query', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const services = query(['projects', 'tag=service']).projects;

// `query projects` returns the config but not the resolved task list, so the
// task side needs its own pass. Keyed by project id, one call rather than one
// per service.
const shipsById = query(['tasks', '--id', 'ship']).tasks;
const configuresById = query(['tasks', '--id', 'configure']).tasks;

const problems = [];
const matrix = [];

for (const project of services.sort((a, b) => a.id.localeCompare(b.id))) {
  if (!shipsById[project.id]) {
    problems.push(`${project.id} (${project.source}) is tagged 'service' but defines no 'ship' task.`);
    continue;
  }

  if (only && project.id !== only) continue;

  matrix.push({
    project: project.id,
    runner: project.config.env?.DEPLOY_RUNNER ?? 'ubuntu-latest',
    configure: Boolean(configuresById[project.id]),
  });
}

if (problems.length > 0) {
  console.error(`${problems.length} service(s) cannot be shipped:\n` + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}

if (check) {
  console.log(`${services.length} service(s) can be shipped.`);
  process.exit(0);
}

if (only && matrix.length === 0) {
  console.error(`No service with id '${only}'. Tagged services: ${services.map((s) => s.id).join(', ') || 'none'}.`);
  process.exit(1);
}

const output = process.env.GITHUB_OUTPUT;
const lines = [
  `matrix=${JSON.stringify(matrix)}`,
  `has_work=${matrix.length > 0}`,
];

if (output) appendFileSync(output, lines.join('\n') + '\n');
for (const line of lines) console.log(line);
