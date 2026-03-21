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
2. **Version gate**: Checks `version.toml` against existing releases on `KBVE/UnrealEngine-Angelscript`
3. **Build**: Clones/updates the private engine repo, builds per-platform
4. **Release**: Uploads artifacts to GitHub Release on the private repo, pushes Docker image for Linux server
5. **Version update**: Auto-PRs `version.toml` + kube image tag bump

## Plugins

Plugins are built and released **separately** from the editor:

- Plugin source lives in `packages/unreal/` in this monorepo
- Plugin CI runs via `utils-unreal-plugin-cicd.yml` (stock UE containers)
- Plugin releases land on `KBVE/kbve` GitHub Releases (e.g., `uedevops-v0.1.0`)
- Users download the editor from the private repo, then download plugin zips from kbve releases and drop them into the editor's `Plugins/` folder

## Engine Source Caching (Longhorn)

To avoid re-cloning the full engine repo (~50GB+) on every build, ARC runners mount a Longhorn PVC:

- PVC: `apps/kube/github/runners/manifests/engine-cache-pvc.yaml` (200Gi on `longhorn-sdb`)
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
- `Dockerfile.dedicated-server` — Linux dedicated server container image
