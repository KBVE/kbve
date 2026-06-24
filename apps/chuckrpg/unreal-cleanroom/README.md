# Unreal Cleanroom

Isolated environment for evaluating Unreal Engine 5.8 assets from Fab Store before integrating into main projects.

## Purpose

Download and test Fab Store assets without polluting:

- Main project (`unreal-chuck`)
- Version control history
- Production dependencies

## Workflow

### 1. Download Asset from Fab

```bash
# Assets auto-download to Unreal Vault
# Default location (adjust if custom):
# Windows: C:\Program Files\Epic Games\UE_5.8\Engine\Content\Marketplace
# macOS: ~/Library/Application Support/Epic/UnrealEngine/5.8/Vault
# Linux: ~/.local/share/Epic/UnrealEngine/5.8/Vault
```

### 2. Import to Cleanroom Project

1. Open cleanroom project in Unreal 5.8
2. Import asset via Fab integration
3. Test in isolated map/level

### 3. Evaluate Asset

Check:

- Performance impact (fps, memory)
- Compatibility with UE 5.8
- Quality vs. advertised screenshots
- License restrictions
- File size bloat

### 4. Decision

**Keep:**

- Document in `docs/evaluated-assets.md`
- Move to `../unreal-chuck` if approved
- Archive to Forgejo LFS backup: `https://git.kbve.com/KBVE/cleanroom`

**Discard:**

- Delete from cleanroom
- Note reason in `docs/rejected-assets.md`

## Directory Structure

```
unreal-cleanroom/
├── Content/             # Imported assets (git-ignored)
├── Config/              # Project settings
├── Source/              # C++ code (if needed for testing)
├── docs/
│   ├── evaluated-assets.md
│   └── rejected-assets.md
└── README.md
```

## LFS Notes

Large binaries tracked via `.gitattributes`. Commit only:

- Evaluation docs
- Test scripts
- Config changes

**Do NOT commit:**

- Full asset files (unless keeping for team review)
- Unreal build artifacts (`Binaries/`, `Intermediate/`)

## Creating Cleanroom Project

### Option 1: Manual (Recommended First Time)

1. Open Unreal Engine 5.8
2. Create New Project → Blank
3. Name: `UnrealCleanroom`
4. Location: `apps/chuckrpg/unreal-cleanroom/`
5. Save

### Option 2: CLI (if UE 5.8 CLI available)

```bash
# Adjust path to your UE 5.8 installation
/path/to/UE_5.8/Engine/Binaries/Mac/UnrealEditor \
  -CreateProject \
  -projectname=UnrealCleanroom \
  -targetpath=apps/chuckrpg/unreal-cleanroom
```

## Integration with Main Project

After asset approval:

```bash
# From cleanroom
cp -r Content/ApprovedAsset ../unreal-chuck/Content/

# Document in main project
echo "Asset XYZ integrated from cleanroom eval" >> ../unreal-chuck/CHANGELOG.md
```

## Cleanup

Periodic cleanup to avoid bloat:

```bash
# Inside cleanroom directory
git clean -fxd Content/     # Remove untracked asset files
```

## Forgejo Archive

Long-term storage for vetted assets:

```bash
# After evaluation complete
git remote add archive https://git.kbve.com/KBVE/cleanroom.git
git push archive main --force  # One-way sync for backup
```
