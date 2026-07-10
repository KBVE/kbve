# Death Slayer - Unreal Engine 5 Game

This directory serves as the monorepo shell for the Death Slayer UE5 game project.

## Overview

Death Slayer is built using Unreal Engine 5.8.0 and features intense action combat mechanics with cross-platform support.

## Structure

- `version.toml` - Version tracking for CI/CD pipeline
- `Build/` - Platform-specific build artifacts (generated during CI)
- `Content/` - Game content (managed in external repo)
- `Source/` - C++ source code (managed in external repo)

## External Repository

The actual game project lives in the external repository:
https://github.com/KBVE/deathslayer

This monorepo shell only contains:

- Version tracking (`version.toml`)
- CI/CD configuration references
- Documentation pointers

## Building

Builds are triggered automatically via CI/CD when the MDX version is bumped:
`apps/kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx`

### Manual Build (local development)

1. Clone the external repository:

    ```bash
    git clone https://github.com/KBVE/deathslayer.git
    ```

2. Pull LFS content:

    ```bash
    cd deathslayer
    git lfs pull
    ```

3. Open in Unreal Editor:
    ```bash
    # Navigate to deathslayer directory
    # Open DeathSlayer.uproject
    ```

## Platforms

- **Win64** - Windows 64-bit
- **Linux** - Linux x86_64
- **Mac** - macOS ARM64 (Apple Silicon) and x86_64 (Intel)

## Distribution

Builds are automatically uploaded to:

- itch.io: https://kbve.itch.io/deathslayer

## Version Management

- MDX version: `apps/kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx`
- TOML version: `apps/deathslayer/unreal-deathslayer/version.toml`

When MDX version > TOML version, the CI pipeline triggers a new build.

## Related Projects

- **Launcher**: `apps/deathslayer/deathslayer-launcher` - Desktop launcher application
- **Server**: Dedicated server configuration (managed via Agones)

## Links

- [Documentation](../../kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx)
- [External Repository](https://github.com/KBVE/deathslayer)
- [itch.io Page](https://kbve.itch.io/deathslayer)
