# Palworld Safe-Rotation Phase 1 — Backup-Before-Rotate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before the rotator deletes the Palworld `GameServer` to adopt a new image, `kubectl exec` a scoped tar of the active world into the `palworld-backups` PVC; abort the rotation if the backup fails.

**Architecture:** The rotator is a single Rust binary (`apps/vm/kubectl/src/main.rs`, `rotate-gameserver` command). Its `rotate_once` already computes a `RotateDecision`; on `Delete` it runs `kubectl delete gs/palworld`. Phase 1 inserts an opt-in backup step immediately before that delete, driven by new `--backup*` CLI flags, using pure argv-builder helpers that are unit-tested. Kube manifests mount the backups PVC into the game pod and grant the rotator `pods/exec`.

**Tech Stack:** Rust (tokio, clap, tracing), Agones GameServer, ArgoCD, Longhorn PVCs, nx (`@monodon/rust`), vitest e2e.

## Global Constraints

- Backup is **strictly additive and opt-in** (`--backup`): with the flag absent, `rotate-gameserver` behaves exactly as today. The same binary rotates Factorio (`apps/kube/agones/factorio/manifests/rotation-deployment.yaml`) — it must stay unaffected.
- No manual version edits beyond the MDX lever. Bump `apps/kbve/astro-kbve/src/content/docs/project/kubectl.mdx` `version` only; leave `apps/vm/kubectl/version.toml` and `Cargo.toml` for the publish pipeline to sync. MDX `version` must be strictly greater than `version.toml` to publish.
- Pin `rotation-deployment.yaml` image tag to the MDX `version` (the tag that will publish), not the stale `version.toml` baseline.
- No inline code comments in new Rust/YAML.
- Build/test through nx: `./kbve.sh -nx kbve-kubectl:test`, `./kbve.sh -nx kbve-kubectl:lint`. Project name is `kbve-kubectl`.
- Worktree has NO `node_modules`; Rust unit tests run without it. Do not `npm install`.
- Commits by the controller on branch `palworld-safe-rotation`; PR targets `dev`. No Co-Authored-By trailer. No direct push to dev/main.

---

### Task 1: Scoped tar argv builder (`backup_tar_args`)

**Files:**
- Modify: `apps/vm/kubectl/src/main.rs` (add helper near the other `rotate_*` helpers, ~line 513; add test in `mod rotate_tests`, ~line 600)

**Interfaces:**
- Produces: `fn backup_tar_args(pod: &str, namespace: &str, container: &str, save_path: &str, world: &str, backup_dir: &str, ts: &str) -> Vec<String>` — the full `kubectl exec … -- sh -c <script>` argv that tars only the scoped world + WindowsServer config into `<backup_dir>/backup-<world>-<ts>.tar.gz`.

- [ ] **Step 1: Write the failing test**

Add to `mod rotate_tests` in `apps/vm/kubectl/src/main.rs`:

```rust
    #[test]
    fn backup_tar_args_scopes_to_world_and_config() {
        let a = super::backup_tar_args(
            "palworld", "palworld", "palworld",
            "/palworld/Pal/Saved", "CB8B6E", "/palworld/backups", "1737",
        );
        assert_eq!(a[0], "exec");
        assert_eq!(a[1], "palworld");
        assert_eq!(&a[2..7], &["-n", "palworld", "-c", "palworld", "--"]);
        assert_eq!(a[7], "sh");
        assert_eq!(a[8], "-c");
        let script = a.last().unwrap();
        assert!(script.contains("/palworld/backups/backup-CB8B6E-1737.tar.gz"));
        assert!(script.contains("-C '/palworld/Pal/Saved'"));
        assert!(script.contains("'SaveGames/0/CB8B6E'"));
        assert!(script.contains("Config/WindowsServer/GameUserSettings.ini"));
        assert!(script.contains("Config/WindowsServer/PalWorldSettings.ini"));
        assert!(!script.contains("-C '/palworld/Pal/Saved' 'Saved'"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: FAIL — `cannot find function backup_tar_args in module super`.

- [ ] **Step 3: Write minimal implementation**

Add above `const HEARTBEAT_PATH` (~line 515) in `apps/vm/kubectl/src/main.rs`:

```rust
fn backup_tar_args(
    pod: &str,
    namespace: &str,
    container: &str,
    save_path: &str,
    world: &str,
    backup_dir: &str,
    ts: &str,
) -> Vec<String> {
    let archive = format!("{backup_dir}/backup-{world}-{ts}.tar.gz");
    let script = format!(
        "set -eu; mkdir -p '{backup_dir}'; \
tar czf '{archive}' -C '{save_path}' \
'SaveGames/0/{world}' \
'Config/WindowsServer/GameUserSettings.ini' \
'Config/WindowsServer/PalWorldSettings.ini'; \
ls -l '{archive}'"
    );
    vec![
        "exec".to_string(),
        pod.to_string(),
        "-n".to_string(),
        namespace.to_string(),
        "-c".to_string(),
        container.to_string(),
        "--".to_string(),
        "sh".to_string(),
        "-c".to_string(),
        script,
    ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: PASS (existing rotate tests still pass).

- [ ] **Step 5: Commit**

```bash
git add apps/vm/kubectl/src/main.rs
git commit -m "feat(kubectl): scoped tar argv builder for palworld backup"
```

---

### Task 2: Retention prune argv builder (`prune_args`)

**Files:**
- Modify: `apps/vm/kubectl/src/main.rs` (helper near `backup_tar_args`; test in `mod rotate_tests`)

**Interfaces:**
- Produces: `fn prune_args(pod: &str, namespace: &str, container: &str, backup_dir: &str, keep: u32) -> Vec<String>` — argv that removes all but the newest `keep` `backup-*.tar.gz` files.

- [ ] **Step 1: Write the failing test**

Add to `mod rotate_tests`:

```rust
    #[test]
    fn prune_args_keeps_n_newest() {
        let a = super::prune_args("palworld", "palworld", "palworld", "/palworld/backups", 5);
        assert_eq!(&a[0..7], &["exec", "palworld", "-n", "palworld", "-c", "palworld", "--"]);
        let s = a.last().unwrap();
        assert!(s.contains("ls -1t '/palworld/backups'/backup-*.tar.gz"));
        assert!(s.contains("tail -n +6"));
        assert!(s.contains("xargs -r rm -f"));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: FAIL — `cannot find function prune_args`.

- [ ] **Step 3: Write minimal implementation**

Add next to `backup_tar_args`:

```rust
fn prune_args(
    pod: &str,
    namespace: &str,
    container: &str,
    backup_dir: &str,
    keep: u32,
) -> Vec<String> {
    let start = keep.saturating_add(1);
    let script = format!(
        "ls -1t '{backup_dir}'/backup-*.tar.gz 2>/dev/null | tail -n +{start} | xargs -r rm -f"
    );
    vec![
        "exec".to_string(),
        pod.to_string(),
        "-n".to_string(),
        namespace.to_string(),
        "-c".to_string(),
        container.to_string(),
        "--".to_string(),
        "sh".to_string(),
        "-c".to_string(),
        script,
    ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vm/kubectl/src/main.rs
git commit -m "feat(kubectl): backup retention prune argv builder"
```

---

### Task 3: Parse `DedicatedServerName` from `GameUserSettings.ini`

**Files:**
- Modify: `apps/vm/kubectl/src/main.rs` (helper + tests)

**Interfaces:**
- Produces: `fn parse_dedicated_server_name(ini: &str) -> Option<String>` — extracts the world pin from either a plain `DedicatedServerName=…` line or an `OptionSettings=(…)` block; `None` when absent/empty.

- [ ] **Step 1: Write the failing test**

Add to `mod rotate_tests`:

```rust
    #[test]
    fn parse_world_plain_line() {
        let ini = "[/Script/Pal.PalGameLocalSettings]\nDedicatedServerName=CB8B6E\n";
        assert_eq!(super::parse_dedicated_server_name(ini).as_deref(), Some("CB8B6E"));
    }

    #[test]
    fn parse_world_option_settings_block() {
        let ini = "OptionSettings=(Difficulty=None,DedicatedServerName=\"CB8B6E\",PublicPort=8211)";
        assert_eq!(super::parse_dedicated_server_name(ini).as_deref(), Some("CB8B6E"));
    }

    #[test]
    fn parse_world_none_when_absent() {
        assert_eq!(super::parse_dedicated_server_name("[Settings]\nFoo=bar\n"), None);
        assert_eq!(super::parse_dedicated_server_name("DedicatedServerName=\n"), None);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: FAIL — `cannot find function parse_dedicated_server_name`.

- [ ] **Step 3: Write minimal implementation**

Add next to the other helpers:

```rust
fn parse_dedicated_server_name(ini: &str) -> Option<String> {
    ini.split(|c: char| matches!(c, '(' | ')' | ',' | '\n' | '\r'))
        .find_map(|field| field.trim().strip_prefix("DedicatedServerName="))
        .map(|v| v.trim().trim_matches('"').to_string())
        .filter(|s| !s.is_empty())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/vm/kubectl/src/main.rs
git commit -m "feat(kubectl): parse DedicatedServerName world pin from ini"
```

---

### Task 4: Wire backup into `rotate_once` behind `--backup` flags

**Files:**
- Modify: `apps/vm/kubectl/src/main.rs` — `RotateGameserver` CLI variant (~line 67), `rotate_once` (~line 397), `cmd_rotate_gameserver` (~line 523), `main` match arm (~line 579); add `BackupOpts` struct + async `resolve_world`/`epoch_secs`/`backup_before_rotate`.

**Interfaces:**
- Consumes: `backup_tar_args`, `prune_args`, `parse_dedicated_server_name` (Tasks 1–3); existing `kubectl_output`, `kubectl_output_with_timeout`.
- Produces: `struct BackupOpts { enabled: bool, world: String, save_path: String, backup_dir: String, keep: u32 }`; `rotate_once(namespace, gameserver, container, delete_timeout, backup: &BackupOpts)`.

- [ ] **Step 1: Write the failing test**

This task is exec-wiring (not purely unit-testable), so the test is a compile-and-flag check plus the existing suite. Add to `mod rotate_tests`:

```rust
    #[test]
    fn backup_opts_disabled_by_default_is_noop_shape() {
        let opts = super::BackupOpts {
            enabled: false,
            world: String::new(),
            save_path: "/palworld/Pal/Saved".to_string(),
            backup_dir: "/palworld/backups".to_string(),
            keep: 5,
        };
        assert!(!opts.enabled);
        assert_eq!(opts.keep, 5);
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./kbve.sh -nx kbve-kubectl:test`
Expected: FAIL — `cannot find struct BackupOpts`.

- [ ] **Step 3: Write minimal implementation**

3a. Add CLI fields to the `RotateGameserver` variant (after `interval`, ~line 79):

```rust
        #[arg(long)]
        backup: bool,
        #[arg(long, default_value = "")]
        world: String,
        #[arg(long, default_value = "/palworld/Pal/Saved")]
        save_path: String,
        #[arg(long, default_value = "/palworld/backups")]
        backup_dir: String,
        #[arg(long, default_value = "5")]
        backup_keep: u32,
```

3b. Add the struct + helpers near `backup_tar_args`:

```rust
#[derive(Clone)]
struct BackupOpts {
    enabled: bool,
    world: String,
    save_path: String,
    backup_dir: String,
    keep: u32,
}

fn epoch_secs() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

async fn resolve_world(
    namespace: &str,
    pod: &str,
    container: &str,
    save_path: &str,
) -> Result<String, String> {
    let path = format!("{save_path}/Config/WindowsServer/GameUserSettings.ini");
    let script = format!("cat '{path}'");
    let ini = kubectl_output(&[
        "exec", pod, "-n", namespace, "-c", container, "--", "sh", "-c", &script,
    ])
    .await
    .map_err(|e| format!("read GameUserSettings.ini: {e}"))?;
    parse_dedicated_server_name(&ini).ok_or_else(|| "DedicatedServerName not found".to_string())
}

async fn backup_before_rotate(
    namespace: &str,
    gameserver: &str,
    container: &str,
    opts: &BackupOpts,
) -> Result<String, String> {
    let world = if opts.world.is_empty() {
        resolve_world(namespace, gameserver, container, &opts.save_path).await?
    } else {
        opts.world.clone()
    };
    let ts = epoch_secs();
    let args = backup_tar_args(
        gameserver, namespace, container, &opts.save_path, &world, &opts.backup_dir, &ts,
    );
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = kubectl_output_with_timeout(&refs, Duration::from_secs(120))
        .await
        .map_err(|e| format!("backup exec failed: {e}"))?;
    tracing::info!("backup ok: {out}");
    let pa = prune_args(gameserver, namespace, container, &opts.backup_dir, opts.keep);
    let prefs: Vec<&str> = pa.iter().map(String::as_str).collect();
    if let Err(e) = kubectl_output(&prefs).await {
        tracing::warn!("backup prune failed (non-fatal): {e}");
    }
    Ok(format!("backup-{world}-{ts}.tar.gz"))
}
```

3c. Change `rotate_once` signature and the `Delete` arm. Replace the signature (~line 397):

```rust
async fn rotate_once(
    namespace: &str,
    gameserver: &str,
    container: &str,
    delete_timeout: u64,
    backup: &BackupOpts,
) -> Result<(), String> {
```

Replace the `RotateDecision::Delete(reason)` arm body (~line 460) with:

```rust
        RotateDecision::Delete(reason) => {
            if backup.enabled {
                match backup_before_rotate(namespace, gameserver, container, backup).await {
                    Ok(name) => tracing::info!("pre-rotate backup created: {name}"),
                    Err(e) => {
                        tracing::error!("pre-rotate backup FAILED, aborting rotation this pass: {e}");
                        return Ok(());
                    }
                }
            }
            tracing::warn!(
                "rotating gs ({reason}): running={running} desired={desired} state={state}"
            );
            kubectl_output_with_timeout(&delete_args, wrapper_timeout)
                .await
                .map_err(|e| format!("rotate delete failed: {e}"))?;
            tracing::info!("delete sent; ArgoCD selfHeal will recreate from {desired}");
            Ok(())
        }
```

3d. Thread through `cmd_rotate_gameserver` (~line 523): add `backup: &BackupOpts` param, and pass it to both `rotate_once` calls (the `!watch` early return at ~line 532 and the watch loop at ~line 554).

```rust
async fn cmd_rotate_gameserver(
    namespace: &str,
    gameserver: &str,
    container: &str,
    delete_timeout: u64,
    watch: bool,
    interval: u64,
    backup: &BackupOpts,
) -> ExitCode {
    if !watch {
        return match rotate_once(namespace, gameserver, container, delete_timeout, backup).await {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                tracing::error!("{e}");
                ExitCode::FAILURE
            }
        };
    }
```

And in the watch loop:

```rust
        if let Err(e) = rotate_once(namespace, gameserver, container, delete_timeout, backup).await {
            tracing::error!("rotate pass failed: {e}");
        }
```

3e. Update the `main` match arm (~line 579) to destructure the new fields, build `BackupOpts`, and pass it:

```rust
        Commands::RotateGameserver {
            namespace,
            gameserver,
            container,
            delete_timeout,
            watch,
            interval,
            backup,
            world,
            save_path,
            backup_dir,
            backup_keep,
        } => {
            let backup_opts = BackupOpts {
                enabled: backup,
                world,
                save_path,
                backup_dir,
                keep: backup_keep,
            };
            cmd_rotate_gameserver(
                &namespace,
                &gameserver,
                &container,
                delete_timeout,
                watch,
                interval,
                &backup_opts,
            )
            .await
        }
```

- [ ] **Step 4: Run test + lint to verify it passes**

Run: `./kbve.sh -nx kbve-kubectl:test && ./kbve.sh -nx kbve-kubectl:lint`
Expected: PASS, no clippy warnings. (If clippy flags `too_many_arguments` on `backup_tar_args`, add `#[allow(clippy::too_many_arguments)]` above it.)

- [ ] **Step 5: Commit**

```bash
git add apps/vm/kubectl/src/main.rs
git commit -m "feat(kubectl): backup palworld world before rotate-gameserver delete"
```

---

### Task 5: Kube manifests — mount backups PVC, grant exec, enable `--backup`

**Files:**
- Modify: `apps/kube/agones/palworld/manifests/gameserver.yaml` (game pod volume + mount)
- Modify: `apps/kube/agones/palworld/manifests/rotation-rbac.yaml` (add `pods/exec`)
- Modify: `apps/kube/agones/palworld/manifests/rotation-deployment.yaml` (args + image tag)

**Interfaces:**
- Consumes: the `--backup*` flags from Task 4; the existing `palworld-backups` PVC (`manifests/backups-pvc.yaml`).

- [ ] **Step 1: Mount the backups PVC into the game pod**

In `gameserver.yaml`, add to `spec.template.spec.volumes` (after the `palworld-saves` volume, ~line 37):

```yaml
                - name: palworld-backups
                  persistentVolumeClaim:
                      claimName: palworld-backups
```

And add to the `palworld` container's `volumeMounts` (after the `palworld-saves` mount, ~line 97):

```yaml
                      - name: palworld-backups
                        mountPath: /palworld/backups
```

- [ ] **Step 2: Grant the rotator `pods/exec`**

In `rotation-rbac.yaml`, add a rule to the `palworld-rotator` Role (after the `pods` rule, ~line 15):

```yaml
    - apiGroups: ['']
      resources: ['pods/exec']
      verbs: ['create']
```

- [ ] **Step 3: Enable backup in the rotator Deployment**

In `rotation-deployment.yaml`, append to `args` (after `--delete-timeout=180`, ~line 43):

```yaml
                      - --backup
                      - --save-path=/palworld/Pal/Saved
                      - --backup-dir=/palworld/backups
                      - --backup-keep=5
```

- [ ] **Step 4: Bump the rotator image tag**

In `rotation-deployment.yaml`, change `image: ghcr.io/kbve/kubectl:0.1.7` to the MDX version set in Task 6 (expected `ghcr.io/kbve/kubectl:0.1.8`). The tag MUST equal the `kubectl.mdx` `version` from Task 6.

- [ ] **Step 5: Validate YAML renders**

Run: `kubectl kustomize apps/kube/agones/palworld/manifests >/dev/null && echo OK`
Expected: `OK` (no schema/parse errors). If no kustomization aggregates `manifests/`, instead run `kubectl apply --dry-run=client -f apps/kube/agones/palworld/manifests/gameserver.yaml -f apps/kube/agones/palworld/manifests/rotation-rbac.yaml -f apps/kube/agones/palworld/manifests/rotation-deployment.yaml` (client dry-run, no cluster mutation).

- [ ] **Step 6: Commit**

```bash
git add apps/kube/agones/palworld/manifests/gameserver.yaml \
        apps/kube/agones/palworld/manifests/rotation-rbac.yaml \
        apps/kube/agones/palworld/manifests/rotation-deployment.yaml
git commit -m "feat(palworld): mount backups PVC, grant rotator exec, enable --backup"
```

---

### Task 6: Version bump (MDX lever) + e2e help assertion

**Files:**
- Modify: `apps/kbve/astro-kbve/src/content/docs/project/kubectl.mdx` (`version` frontmatter)
- Modify: `apps/vm/kubectl-e2e/e2e/kbve-kubectl.spec.ts` (help assertion)

**Interfaces:**
- Consumes: the `--backup*` flags from Task 4; the image tag pinned in Task 5 Step 4.

- [ ] **Step 1: Read the current MDX version**

Run: `grep -m1 '^version:' apps/kbve/astro-kbve/src/content/docs/project/kubectl.mdx`
Expected: `version: "0.1.7"` (matches `version.toml`).

- [ ] **Step 2: Bump MDX version**

Set `version` in `kubectl.mdx` to the next patch above `version.toml` — `version: "0.1.8"`. Do NOT edit `version.toml` or `Cargo.toml` (the publish pipeline syncs them). Confirm Task 5 Step 4 pins the deployment image to this same `0.1.8`.

- [ ] **Step 3: Write the failing e2e assertion**

Add inside the `describe('kbve-kubectl CLI', …)` block in `apps/vm/kubectl-e2e/e2e/kbve-kubectl.spec.ts`:

```ts
	it('should list backup flags in rotate-gameserver help', () => {
		const out = dockerExec('kbve-kubectl rotate-gameserver --help');
		expect(out).toContain('--backup');
		expect(out).toContain('--world');
		expect(out).toContain('--save-path');
		expect(out).toContain('--backup-dir');
		expect(out).toContain('--backup-keep');
	});
```

- [ ] **Step 4: Verify (build image, run e2e if the harness is available)**

The e2e runs against a built `kbve/kubectl` image. If running locally with docker available:
Run: `./kbve.sh -nx kbve-kubectl-e2e:e2e`
Expected: the new test passes (help output lists all five flags). If the e2e harness/docker is unavailable in this environment, note it — the assertion is validated in CI — and rely on `kbve-kubectl:test` + a local `cargo run -- rotate-gameserver --help` smoke check showing the flags.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/project/kubectl.mdx \
        apps/vm/kubectl-e2e/e2e/kbve-kubectl.spec.ts
git commit -m "chore(kubectl): bump MDX to 0.1.8, e2e asserts --backup flags"
```

---

## Rollout (after merge to dev → main)

1. Merge `palworld-safe-rotation` → `dev` (PR), then promote to `main`.
2. CI publishes `ghcr.io/kbve/kubectl:0.1.8` (MDX lever) and syncs `version.toml`.
3. ArgoCD applies: game pod gains the backups mount (pod recreate), rotator Role gains
   `pods/exec`, rotator Deployment adopts `0.1.8` with `--backup`.
4. Verify: trigger a benign image drift (or wait for the next real bump) and confirm a
   `backup-CB8B6E-<ts>.tar.gz` lands in the backups PVC before the GS is deleted:
   `kubectl -n palworld exec palworld -c palworld -- ls -l /palworld/backups`.

## Self-Review

- **Spec coverage:** Phase 1 rows of the spec's phasing table (scoped backup, retention
  keep-N, game-pod mount, `pods/exec` RBAC, opt-in flags, image+MDX bump) each map to a
  task (1–6). Health-gate/hold/ConfigMap/restore are explicitly Phase 2/3, out of this plan.
- **Placeholder scan:** none — every code and YAML step shows exact content; the only
  deferred value is the concrete MDX version, resolved in Task 6 Step 1–2 by reading the
  file, expected `0.1.8`.
- **Type consistency:** `BackupOpts` fields (`enabled`/`world`/`save_path`/`backup_dir`/
  `keep`) are used identically in Task 4 3b/3e; `backup_tar_args`/`prune_args`/
  `parse_dedicated_server_name` signatures match their call sites; CLI field names
  (`backup`,`world`,`save_path`,`backup_dir`,`backup_keep`) match the `main` destructure.
