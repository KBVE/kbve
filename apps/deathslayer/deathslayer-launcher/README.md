# Death Slayer Launcher

Cross-platform desktop launcher for Death Slayer built with Tauri 2 and React 19.

## Features

- **Automatic Updates**: Check and download game updates from itch.io
- **Version Management**: Track installed game versions
- **One-Click Launch**: Launch the game directly from the launcher
- **Cross-Platform**: Windows, macOS, and Linux support
- **Modern UI**: Built with React 19 and Tailwind CSS

## Development

### Prerequisites

- Node.js 20+ and pnpm
- Rust toolchain (1.70+)
- Tauri CLI

### Run in Development Mode

```bash
# From the monorepo root
nx run deathslayer-launcher:dev

# Or from this directory
pnpm tauri dev
```

The development server runs on `http://localhost:1423`.

### Build for Production

```bash
# From the monorepo root
nx run deathslayer-launcher:build:tauri

# Or from this directory
pnpm tauri build
```

Binaries will be output to `src-tauri/target/release`.

## Architecture

### Frontend (React + TypeScript)

- `src/App.tsx` - Main application component
- `src/main.tsx` - React entry point
- `src/index.css` - Global styles with Tailwind CSS

### Backend (Rust + Tauri)

- `src-tauri/src/main.rs` - Tauri application entry point
- `src-tauri/src/launcher/` - Game launcher logic
    - Update checking
    - Game download and installation
    - Version management
    - Game launching

## Tauri Commands

The launcher exposes the following Tauri commands:

- `check_updates()` - Check for game updates from itch.io
- `download_game(version: string)` - Download a specific game version
- `launch_game()` - Launch the installed game
- `get_game_status()` - Get current game installation status

## Configuration

Configuration is stored in:

- macOS: `~/Library/Application Support/com.kbve.deathslayer.launcher/`
- Windows: `%APPDATA%\com.kbve.deathslayer.launcher\`
- Linux: `~/.local/share/com.kbve.deathslayer.launcher/`

## macOS Code Signing

For macOS builds with code signing:

```bash
# Set environment variables
export APPLE_CERTIFICATE="<base64-encoded-certificate>"
export APPLE_CERTIFICATE_PASSWORD="<password>"
export APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
export APPLE_ID="your-apple-id@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAMID123"

# Build
pnpm tauri build
```

The CI/CD pipeline handles code signing automatically using GitHub secrets.

## Deep Links

The launcher registers the `deathslayer-launcher://` URL scheme for deep linking:

```
deathslayer-launcher://launch
deathslayer-launcher://update
```

## Distribution

Built binaries are distributed via:

- Direct download from itch.io
- GitHub Releases (via CI/CD)

## Testing

```bash
# Test Rust backend
nx run deathslayer-launcher:test:rust

# Or
cd src-tauri && cargo test
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4
- **Backend**: Rust, Tauri 2
- **State Management**: Zustand
- **Build Tool**: Nx, pnpm

## Related

- [Death Slayer Game Documentation](../../kbve/astro-kbve/src/content/docs/project/unreal-deathslayer.mdx)
- [Game Repository](https://github.com/KBVE/deathslayer)
- [itch.io Page](https://kbve.itch.io/deathslayer)

## License

MIT
