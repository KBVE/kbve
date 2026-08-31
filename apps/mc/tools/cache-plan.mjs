// Which of the mc cache images a change actually needs rebuilt.
//
// apps/mc/Dockerfile pulls two pre-baked layers with COPY --from:
// ghcr.io/kbve/mc:gradle (the Fabric Loom dependency cache) and
// ghcr.io/kbve/mc:mods (the Modrinth jar payload). Each had its own workflow,
// and the two were the same hundred lines with a different task name at the
// end.
//
// They cannot simply become a matrix, because a GitHub path filter is per
// workflow rather than per matrix entry: any change under apps/mc would
// rebuild both, and the gradle layer is a sixty minute build with no registry
// cache behind it. So the workflow triggers coarsely on apps/mc/** and this
// decides precisely, from one list rather than from a path filter duplicated
// per workflow and drifting from it.
//
// Unknown base, or a change to the workflow or this file: build everything.
// Being wrong in that direction costs a rebuild; being wrong in the other
// leaves a stale cache image that the next mc build silently inherits.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const LAYERS = {
  gradle: {
    // Loom resolves Minecraft, Yarn, Loader and the Fabric API from these, so
    // a pin bump in any of them is what makes the cached layer wrong.
    paths: [
      'apps/mc/Dockerfile.gradle',
      'apps/mc/behavior_statetree/java/build.gradle',
      'apps/mc/behavior_statetree/java/settings.gradle',
      'apps/mc/mc_auth/java/build.gradle',
      'apps/mc/mc_auth/java/settings.gradle',
    ],
    timeout: 60,
    // Nothing else fits beside a full Loom cache on a hosted runner.
    freeLargePackages: true,
  },
  mods: {
    // The MODS array and its sha1 pins. Source changes never invalidate it.
    paths: ['apps/mc/Dockerfile.mods'],
    timeout: 30,
    freeLargePackages: false,
  },
};

// The task definitions live here, so a change to them can invalidate either.
const ALL = ['apps/mc/moon.yml', 'apps/mc/tools/cache-plan.mjs', '.github/workflows/ci-mc.yml'];

const requested = process.env.LAYER_INPUT?.trim();
const base = process.env.BASE_SHA?.trim();
const head = process.env.HEAD_SHA?.trim() || 'HEAD';

const entry = (layer) => ({ layer, ...LAYERS[layer], paths: undefined });

let selected;
let why;

if (requested && requested !== 'all') {
  if (!LAYERS[requested]) {
    console.error(`No cache layer called '${requested}'. Known layers: ${Object.keys(LAYERS).join(', ')}.`);
    process.exit(1);
  }
  selected = [requested];
  why = `requested explicitly`;
} else if (requested === 'all' || !base || /^0+$/.test(base)) {
  selected = Object.keys(LAYERS);
  why = requested === 'all' ? 'requested explicitly' : 'no base commit to compare against';
} else {
  let changed;
  try {
    changed = execFileSync('git', ['diff', '--name-only', `${base}..${head}`], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
  } catch {
    // A force push or a shallow clone can leave the base unreachable. Build
    // everything rather than quietly deciding nothing changed.
    selected = Object.keys(LAYERS);
    changed = null;
    why = `base ${base} is not reachable`;
  }

  if (changed) {
    if (changed.some((file) => ALL.includes(file))) {
      selected = Object.keys(LAYERS);
      why = 'a shared definition changed';
    } else {
      selected = Object.keys(LAYERS).filter((layer) =>
        changed.some((file) => LAYERS[layer].paths.includes(file)),
      );
      why = `${changed.length} file(s) changed`;
    }
  }
}

const matrix = selected.map(entry);

console.log(`${matrix.length} layer(s) to build (${why}): ${selected.join(', ') || 'none'}`);

const lines = [`matrix=${JSON.stringify({ include: matrix })}`, `has_work=${matrix.length > 0}`];
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
for (const line of lines) console.log(line);
