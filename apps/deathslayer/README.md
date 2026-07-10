# Death Slayer

Death Slayer is an action-packed UE5 game built with Unreal Engine 5.8.0, featuring intense combat mechanics and dynamic environments.

## Project Structure

```
apps/deathslayer/
├── unreal-deathslayer/          # UE5 game project shell
│   ├── version.toml             # Version tracking for CI/CD
│   └── README.md                # Game-specific documentation
├── deathslayer-launcher/        # Desktop launcher (Tauri + React)
│   ├── src/                     # React frontend
│   ├── src-tauri/               # Rust backend
│   ├── package.json
│   └── project.json
├── CODESIGNING.md               # macOS code signing guide
└── README.md                    # This file
```

## Components

### 1. Unreal Engine Game ([unreal-deathslayer/](unreal-deathslayer/))

The main game built with UE5, distributed via the CI/CD pipeline.

**External Repository**: https://github.com/KBVE/deathslayer

**Documentation**: [unreal-deathslayer.mdx](../kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx)

**Features**:

- UE5.8.0 with Lumen and Nanite
- Cross-platform (Windows, Linux, macOS)
- Dedicated server support (Linux)
- itch.io distribution

### 2. Desktop Launcher ([deathslayer-launcher/](deathslayer-launcher/))

A modern desktop launcher built with Tauri 2 and React 19.

**Features**:

- Automatic game updates from itch.io
- Version management
- One-click launch
- News and announcements
- Cross-platform (Windows, Linux, macOS)

**Tech Stack**:

- Tauri 2 (Rust backend)
- React 19 (Frontend)
- Tailwind CSS 4
- Zustand (State management)

### 3. Code Signing ([CODESIGNING.md](CODESIGNING.md))

Comprehensive guide for macOS code signing and notarization.

## Quick Start

### Prerequisites

- **For Game Development**:
    - Unreal Engine 5.8.0
    - Visual Studio 2022 (Windows) or Xcode (macOS)
    - Git LFS

- **For Launcher Development**:
    - Node.js 20+ and pnpm
    - Rust 1.70+
    - Tauri CLI

### Setup Game Repository

```bash
# Clone the external game repository
git clone https://github.com/KBVE/deathslayer.git
cd deathslayer

# Pull LFS content
git lfs pull

# Open in Unreal Editor
# Navigate to deathslayer/DeathSlayer.uproject
```

### Setup Launcher

```bash
# From monorepo root
cd apps/deathslayer/deathslayer-launcher

# Install dependencies (done at root level)
# pnpm install

# Run in development mode
nx run deathslayer-launcher:dev

# Or directly
pnpm tauri dev
```

## Development

### Game Development

Work in the external repository (https://github.com/KBVE/deathslayer):

```bash
cd path/to/deathslayer
# Open DeathSlayer.uproject in Unreal Editor
```

Changes are automatically picked up by CI/CD when pushed to the main branch.

### Launcher Development

```bash
# Run launcher
nx run deathslayer-launcher:dev

# Build launcher
nx run deathslayer-launcher:build:tauri

# Test Rust backend
nx run deathslayer-launcher:test:rust
```

### Testing

```bash
# Test Rust components
cd apps/deathslayer/deathslayer-launcher/src-tauri
cargo test

# Lint
nx run deathslayer-launcher:lint
```

## CI/CD Pipeline

### How It Works

1. **Version Gate**: When the MDX `version:` exceeds `version.toml`, a build is triggered
2. **External Clone**: CI clones https://github.com/KBVE/deathslayer
3. **Multi-Platform Build**: Builds for Win64, Linux, and Mac
4. **Code Signing**: macOS builds are signed and notarized
5. **Distribution**: Uploads to itch.io (kbve/deathslayer)
6. **Post-Publish**: Auto-updates `version.toml` via PR

### Triggering a Build

```bash
# 1. Update version in MDX
# Edit: apps/kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx
# Change: version: "0.1.0" -> version: "0.1.1"

# 2. Sync manifest
npx nx run astro-kbve:sync:ci-manifest

# 3. Commit and push
git add .
git commit -m "chore: bump Death Slayer to v0.1.1"
git push
```

### CI Configuration

The game is configured in [.github/ci-dispatch-manifest.json](.github/ci-dispatch-manifest.json):

```json
{
	"key": "unreal_deathslayer",
	"app_name": "deathslayer",
	"engine": {
		"version": "5.8.0",
		"project_path": "deathslayer",
		"external_repo_url": "https://github.com/KBVE/deathslayer",
		"build_targets": ["Win64", "Linux", "Mac"],
		"client_config": "Shipping",
		"server_target": "deathslayerServer",
		"server_config": "Shipping"
	},
	"external_publish": {
		"itch_user": "kbve",
		"itch_game": "deathslayer"
	}
}
```

## Distribution

### itch.io

Game builds are automatically uploaded to:
https://kbve.itch.io/deathslayer

**Channels**:

- `windows` - Windows builds
- `linux` - Linux builds
- `macos` - macOS builds (signed & notarized)

### GitHub Releases

Launcher releases can be distributed via GitHub:

```bash
# Build launcher
nx run deathslayer-launcher:build:tauri

# Binaries in: apps/deathslayer/deathslayer-launcher/src-tauri/target/release/
```

## macOS Code Signing

For macOS distribution, code signing and notarization are required.

See [CODESIGNING.md](CODESIGNING.md) for detailed setup instructions.

**Required GitHub Secrets**:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

## Architecture

### Game Architecture

- **Game Mode**: `DeathSlayerGameMode` - Core game logic
- **Main Menu**: `/Game/Menus/L_MainMenu`
- **Game World**: `/Game/Maps/L_DeathSlayerWorld`
- **Server**: Dedicated Linux server (`deathslayerServer`)

### Launcher Architecture

**Frontend** (React):

- `App.tsx` - Main UI component
- State management via Zustand
- Tailwind CSS styling

**Backend** (Rust):

- `launcher/mod.rs` - Game management logic
- Update checking
- Download and installation
- Game launching

## Deployment

### Game Deployment

Automatic via CI/CD:

1. Push to main branch of https://github.com/KBVE/deathslayer
2. Version gate triggers build
3. Multi-platform builds created
4. Uploaded to itch.io

### Launcher Deployment

Manual or via CI:

```bash
# Build for current platform
nx run deathslayer-launcher:build:tauri

# Output: src-tauri/target/release/bundle/
#   - macOS: .app, .dmg
#   - Windows: .exe, .msi
#   - Linux: .appimage, .deb
```

## Troubleshooting

### Game Issues

**Problem**: Game won't open on macOS

- **Solution**: App needs to be signed and notarized. See [CODESIGNING.md](CODESIGNING.md)

**Problem**: Content missing after clone

- **Solution**: Run `git lfs pull` in the game repository

**Problem**: Build fails on specific platform

- **Solution**: Check CI logs for platform-specific errors

### Launcher Issues

**Problem**: Rust compilation fails

- **Solution**: Ensure Rust 1.70+ installed: `rustup update`

**Problem**: Frontend dev server won't start

- **Solution**: Port 1423 may be in use. Kill process: `lsof -ti:1423 | xargs kill`

**Problem**: Tauri build fails on macOS

- **Solution**: Install Xcode Command Line Tools: `xcode-select --install`

## Roadmap

### Game Features

- [x] Core combat mechanics
- [x] Basic level design
- [x] Multi-platform support
- [ ] Multiplayer networking
- [ ] Achievement system
- [ ] Cloud saves
- [ ] Steam integration
- [ ] Mobile support (iOS/Android)

### Launcher Features

- [x] Basic game launching
- [x] Version checking
- [ ] Automatic updates
- [ ] News feed
- [ ] Mod management
- [ ] Cloud save sync
- [ ] Friend list integration

## Contributing

See the main repository for contribution guidelines:
https://github.com/KBVE/deathslayer

## Links

- **Game Repository**: https://github.com/KBVE/deathslayer
- **itch.io Page**: https://kbve.itch.io/deathslayer
- **Documentation**: [unreal-deathslayer.mdx](../kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx)
- **Issue Tracker**: https://github.com/KBVE/deathslayer/issues
- **Development Board**: https://github.com/orgs/KBVE/projects

## License

MIT - See external repository for full license details.

## Support

For issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Search [existing issues](https://github.com/KBVE/deathslayer/issues)
3. Create a new issue with:
    - Platform (Windows/Linux/macOS)
    - UE version or launcher version
    - Steps to reproduce
    - Error messages/logs

## Credits

Developed by KBVE Team using:

- Unreal Engine 5.8.0
- Tauri 2
- React 19
- Rust

---

**Last Updated**: 2026-06-30
**Version**: 0.1.0
