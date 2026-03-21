# AngelScript Engine CI/CD

Automated builds for the private [KBVE/UnrealEngine-Angelscript](https://github.com/KBVE/UnrealEngine-Angelscript) engine fork.

## Build Targets

| Platform                     | Runner              | Output                                                              |
| ---------------------------- | ------------------- | ------------------------------------------------------------------- |
| Windows Client (x86)         | `arc-runner-ue-win` | `.zip` artifact + GitHub Release                                    |
| Mac Client (x86)             | `arc-runner-ue-mac` | `.zip` artifact + GitHub Release                                    |
| Linux Dedicated Server (x86) | `arc-runner-ue`     | `.zip` artifact + Docker image at `ghcr.io/kbve/angelscript-server` |

## How It Works

1. **Trigger**: Manual `workflow_dispatch` on `ci-angelscript-engine.yml`
2. **Version gate**: Checks `version.toml` against existing GitHub Releases
3. **Plugin bundle**: Reads `plugins.json`, bundles all listed plugins from `packages/unreal/`
4. **Build**: Clones/updates the private engine repo, injects plugins, builds per-platform
5. **Release**: Uploads artifacts to GitHub Release, pushes Docker image for Linux server
6. **Version update**: Auto-PRs `version.toml` bump after successful release

## Engine Source Caching (Longhorn)

To avoid re-cloning the full engine repo (~50GB+) on every build, ARC runners mount a Longhorn PVC:

- PVC: `apps/kube/angelscript/pvc-engine-cache.yaml` (200Gi, `ReadWriteOnce`)
- Mount path: `/mnt/longhorn/angelscript-engine`
- First build clones fresh; subsequent builds do `git fetch + checkout`

## Release Strategy

- **Windows + Mac**: Released on [KBVE/UnrealEngine-Angelscript](https://github.com/KBVE/UnrealEngine-Angelscript) as zip attachments
- **Linux Docker**: Pushed to `ghcr.io/kbve/angelscript-server:{version}`
- **Kube deployment**: Auto-PR bumps image tag in `apps/kube/angelscript/manifest/deployment.yaml`

## Secrets Required

| Secret         | Description                                                                         |
| -------------- | ----------------------------------------------------------------------------------- |
| `UNITY_PAT`    | GitHub PAT with read + release access to `KBVE/UnrealEngine-Angelscript` (existing) |
| `GITHUB_TOKEN` | Auto-provided, used for GHCR push and kube image tag PR                             |

## Files

- `project.json` — Nx project definition
- `version.toml` — Version gate (updated after each release)
- `plugins.json` — Custom UE plugins to inject into engine builds
- `Dockerfile.dedicated-server` — Linux dedicated server container image
