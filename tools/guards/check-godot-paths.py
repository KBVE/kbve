#!/usr/bin/env python3
"""Every Godot project has to be inside the test workflow's path filter.

CI - Godot Tests used to trigger on all of apps/** and crates/**, which is
most of the tree: a one-file change to a rust crate that no Godot project has
ever loaded still queued the Discover job, and under a busy runner pool a
queued job is the cost. Narrowing the filter to the directories Godot projects
actually live in is the manifest's drift problem in miniature -- a new project,
or a renamed one, silently stops being tested and the suite stays green -- so
the filter is checked against the tree rather than trusted.

A Godot project is one whose moon.yml carries the `godot` tag and an
ENGINE_CONFIG, the same test tools/release/godot-matrix.mjs applies.
"""

import sys
from pathlib import Path

import yaml

WORKFLOW = Path('.github/workflows/ci-godot-tests.yml')


def godot_projects(root: Path) -> list[Path]:
    found = []
    for manifest in sorted(root.glob('apps/**/moon.yml')):
        config = yaml.safe_load(manifest.read_text()) or {}
        if 'godot' not in (config.get('tags') or []):
            continue
        if not (config.get('env') or {}).get('ENGINE_CONFIG'):
            continue
        found.append(manifest.parent.relative_to(root))
    return found


def covered(project: Path, patterns: list[str]) -> bool:
    for pattern in patterns:
        prefix = pattern[: -len('/**')] if pattern.endswith('/**') else pattern
        if '*' in prefix:
            continue
        if project == Path(prefix) or Path(prefix) in project.parents:
            return True
    return False


def main() -> int:
    root = Path.cwd()
    workflow = yaml.safe_load((root / WORKFLOW).read_text())
    # `on` is the YAML 1.1 boolean, and PyYAML reads the key as True.
    triggers = workflow.get('on', workflow.get(True))
    patterns = triggers['pull_request']['paths']

    projects = godot_projects(root)
    if not projects:
        print('no Godot project found; the tag or ENGINE_CONFIG test has drifted')
        return 1

    missing = [p for p in projects if not covered(p, patterns)]
    if missing:
        print(f'{WORKFLOW} does not trigger on:')
        for project in missing:
            print(f"  {project}  -- add '{project}/**' to its pull_request paths")
        return 1

    print(f'{len(projects)} Godot project(s) covered by {WORKFLOW}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
