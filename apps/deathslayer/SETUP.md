# Death Slayer - Quick Setup Guide

This guide helps you get Death Slayer set up in the KBVE pipeline quickly.

## What We've Created

### 1. Documentation

- **MDX File**: [apps/kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx](../kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx)
    - Complete project documentation
    - Pipeline configuration
    - Version tracking setup

### 2. Project Structure

- **Game Shell**: `apps/deathslayer/unreal-deathslayer/`
    - `version.toml` - Version tracking
    - `README.md` - Game-specific docs

- **Launcher**: `apps/deathslayer/deathslayer-launcher/`
    - Tauri 2 + React 19 desktop app
    - Cross-platform game launcher
    - Automatic updates support

### 3. CI/CD Integration

- **Manifest Entry**: Added to `.github/ci-dispatch-manifest.json`
    - Configured for Win64, Linux, Mac builds
    - itch.io distribution setup
    - External repo integration (https://github.com/KBVE/deathslayer)

## Next Steps

### Step 1: Create the External Repository

If it doesn't exist yet:

```bash
# Create new repo at https://github.com/KBVE/deathslayer
# Clone it
git clone https://github.com/KBVE/deathslayer.git
cd deathslayer

# Initialize UE5 project
# Create DeathSlayer.uproject in deathslayer/ directory
```

### Step 2: Set Up Git LFS (if needed)

```bash
cd deathslayer

# Initialize Git LFS
git lfs install

# Track common Unreal file types
git lfs track "*.uasset"
git lfs track "*.umap"
git lfs track "*.upk"
git lfs track "*.fbx"
git lfs track "*.png"
git lfs track "*.jpg"
git lfs track "*.tga"
git lfs track "*.wav"
git lfs track "*.mp3"

# Commit .gitattributes
git add .gitattributes
git commit -m "chore: configure Git LFS"
git push
```

### Step 3: Configure Unreal Project

In `DeathSlayer.uproject`, ensure proper settings:

```json
{
	"FileVersion": 3,
	"EngineAssociation": "5.8",
	"Category": "Games",
	"Description": "Death Slayer - Action Game",
	"Modules": [
		{
			"Name": "DeathSlayer",
			"Type": "Runtime",
			"LoadingPhase": "Default"
		}
	],
	"Plugins": [],
	"TargetPlatforms": ["Windows", "Linux", "Mac"]
}
```

### Step 4: Create Game Mode

Create `Source/DeathSlayer/DeathSlayerGameMode.h`:

```cpp
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "DeathSlayerGameMode.generated.h"

UCLASS()
class DEATHSLAYER_API ADeathSlayerGameMode : public AGameModeBase
{
    GENERATED_BODY()

public:
    ADeathSlayerGameMode();
};
```

### Step 5: Create Required Maps

In Unreal Editor:

1. Create `Content/Menus/L_MainMenu.umap`
2. Create `Content/Maps/L_DeathSlayerWorld.umap`
3. Set default map in Project Settings → Maps & Modes

### Step 6: Configure GitHub Secrets

Add these secrets to your GitHub repository:

**For macOS Code Signing** (`Settings > Secrets and variables > Actions`):

```
APPLE_CERTIFICATE - Base64-encoded .p12 certificate
APPLE_CERTIFICATE_PASSWORD - Certificate password
APPLE_SIGNING_IDENTITY - "Developer ID Application: ..."
APPLE_ID - your-apple-id@email.com
APPLE_PASSWORD - App-specific password
APPLE_TEAM_ID - Your Apple Team ID
```

**For itch.io Distribution**:

```
butler_api - itch.io API key (for butler uploads)
```

See [CODESIGNING.md](CODESIGNING.md) for detailed instructions.

### Step 7: Test Local Build

Before triggering CI:

```bash
# Windows (from UE5 installation)
RunUAT.bat BuildCookRun -project="D:\deathslayer\DeathSlayer.uproject" ^
  -platform=Win64 -clientconfig=Shipping -cook -stage -pak

# Linux/Mac
./RunUAT.sh BuildCookRun -project="/path/to/DeathSlayer.uproject" \
  -platform=Linux -clientconfig=Shipping -cook -stage -pak
```

### Step 8: Trigger First Build

Once the external repo is ready:

```bash
# In KBVE monorepo
cd apps/kbve/astro-kbve/src/content/docs/project

# Edit unreal-deathslayer.mdx
# Change version from "0.1.0" to "0.1.1" (or keep as "0.1.0" for first build)

# Sync manifest
cd /path/to/kbve
npx nx run astro-kbve:sync:ci-manifest

# Commit and push
git add .
git commit -m "chore(deathslayer): trigger initial build v0.1.0"
git push
```

The CI pipeline will:

1. Detect version change
2. Clone https://github.com/KBVE/deathslayer
3. Build for Win64, Linux, Mac
4. Sign macOS build
5. Upload to itch.io

### Step 9: Set Up Launcher Icons

Generate launcher icons:

```bash
cd apps/deathslayer/deathslayer-launcher

# Create a 512x512 source icon (PNG with transparency)
# Then run:
pnpm tauri icon path/to/source-icon.png

# This generates all required icon sizes
```

### Step 10: Test Launcher Locally

```bash
# Install dependencies (if not done)
pnpm install

# Run launcher in dev mode
nx run deathslayer-launcher:dev

# Build for production
nx run deathslayer-launcher:build:tauri
```

## Verification Checklist

- [ ] External repo created: https://github.com/KBVE/deathslayer
- [ ] Git LFS configured and working
- [ ] UE5 project opens without errors
- [ ] Game mode (`DeathSlayerGameMode`) created
- [ ] Required maps created (`L_MainMenu`, `L_DeathSlayerWorld`)
- [ ] Local UE5 build succeeds
- [ ] GitHub secrets configured (for macOS signing)
- [ ] itch.io butler API key added
- [ ] MDX version updated and manifest synced
- [ ] First CI build triggered and successful
- [ ] Game published to itch.io
- [ ] Launcher icons generated
- [ ] Launcher builds successfully

## Common Issues

### Issue: External repo not found in CI

**Cause**: Repository is private or GitHub PAT doesn't have access

**Solution**:

1. Make repo public, or
2. Add deploy key to external repo
3. Verify `GITHUB_TOKEN` has repo access

### Issue: macOS build fails with signing error

**Cause**: Missing or incorrect Apple secrets

**Solution**:

1. Verify all `APPLE_*` secrets are set correctly
2. Check certificate hasn't expired
3. Ensure app-specific password is valid
4. See [CODESIGNING.md](CODESIGNING.md) for details

### Issue: itch.io upload fails

**Cause**: Missing or invalid butler API key

**Solution**:

1. Generate API key at https://itch.io/user/settings/api-keys
2. Add as `butler_api` secret in GitHub
3. Verify itch.io project exists: https://kbve.itch.io/deathslayer

### Issue: Version gate doesn't trigger

**Cause**: MDX version not properly synced to manifest

**Solution**:

```bash
# Re-sync manifest
npx nx run astro-kbve:sync:ci-manifest

# Verify change in .github/ci-dispatch-manifest.json
git diff .github/ci-dispatch-manifest.json

# Commit if changed
git add .github/ci-dispatch-manifest.json
git commit -m "chore: sync manifest"
git push
```

### Issue: Build succeeds but game won't run

**Cause**: Missing content or dependencies

**Solution**:

1. Verify Git LFS pulled all content: `git lfs pull`
2. Check all required maps exist
3. Verify game mode is set correctly
4. Test in Unreal Editor first

## File Structure Reference

```
kbve/                                           # Monorepo
├── .github/
│   └── ci-dispatch-manifest.json              # ✅ Updated with Death Slayer entry
├── apps/
│   ├── deathslayer/
│   │   ├── unreal-deathslayer/
│   │   │   ├── version.toml                   # ✅ Version tracking
│   │   │   └── README.md                      # ✅ Game docs
│   │   ├── deathslayer-launcher/
│   │   │   ├── src/                           # ✅ React frontend
│   │   │   ├── src-tauri/                     # ✅ Rust backend
│   │   │   ├── package.json                   # ✅ Dependencies
│   │   │   └── project.json                   # ✅ Nx config
│   │   ├── CODESIGNING.md                     # ✅ Code signing guide
│   │   ├── SETUP.md                           # ✅ This file
│   │   └── README.md                          # ✅ Main docs
│   └── kbve/
│       └── astro-kbve/
│           └── src/
│               └── content/
│                   └── docs/
│                       └── project/
│                           └── unreal-deathslayer.mdx  # ✅ Project docs

deathslayer/                                    # External repo (to create)
├── .gitattributes                             # ⚠️ Git LFS config needed
├── .gitignore
├── DeathSlayer.uproject                       # ⚠️ UE5 project needed
├── Content/
│   ├── Menus/
│   │   └── L_MainMenu.umap                    # ⚠️ Map needed
│   └── Maps/
│       └── L_DeathSlayerWorld.umap            # ⚠️ Map needed
├── Source/
│   └── DeathSlayer/
│       ├── DeathSlayerGameMode.h              # ⚠️ Game mode needed
│       └── DeathSlayerGameMode.cpp            # ⚠️ Game mode needed
└── Config/
    └── DefaultEngine.ini
```

Legend:

- ✅ Already created
- ⚠️ Needs to be created

## Resources

- [Unreal Engine Documentation](https://docs.unrealengine.com/5.0/)
- [Tauri Documentation](https://tauri.app/v2/)
- [itch.io Butler Documentation](https://itch.io/docs/butler/)
- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)

## Support

If you need help:

1. Check this setup guide
2. Review [README.md](README.md)
3. Check [CODESIGNING.md](CODESIGNING.md) for macOS issues
4. Ask in team chat
5. Create an issue in the monorepo

---

**Setup Complete!** 🎮

The Death Slayer project is now integrated into the KBVE pipeline. Follow the next steps above to complete the external repository setup and trigger your first build.
