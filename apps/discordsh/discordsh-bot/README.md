# discordsh-bot

Standalone Discord gateway bot for DiscordSH.

## Features

- Poise/serenity Discord gateway with shard support
- Slash commands: `/github`, `/gh`, `/dungeon`, `/ping`, `/status`, `/health`, `/admin`
- Embed Dungeon game with bevy_battle combat and bevy_inventory item management
- GitHub issue/PR management with SVG card rendering
- Player persistence via Supabase
- Minimal health HTTP server on port 4322 for k8s probes

## Architecture

```
discordsh-bot
├── discord/           # Bot framework, commands, components
│   ├── commands/      # Slash command handlers
│   ├── components/    # Interactive button/select handlers
│   ├── embeds/        # Notice board, task board, status
│   └── game/          # Embed Dungeon (types, logic, combat, cards, persistence)
├── health/            # Background CPU/memory monitoring
├── health_server.rs   # Minimal axum health endpoint
├── tracker/           # Shard tracking (Supabase-backed)
├── state.rs           # Central AppState
└── main.rs            # Entry point + bot restart loop
```

## Environment Variables

| Variable                    | Required | Description                                                  |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `DISCORD_TOKEN`             | Yes      | Discord bot token                                            |
| `SUPABASE_URL`              | No       | Supabase API URL (for persistence)                           |
| `SUPABASE_SERVICE_ROLE_KEY` | No       | Supabase service role key                                    |
| `GITHUB_TOKEN`              | No       | GitHub PAT for API commands                                  |
| `GITHUB_DEFAULT_REPO`       | No       | Default repo for `/github` commands (default: `KBVE/kbve`)   |
| `HEALTH_PORT`               | No       | Health server port (default: `4322`)                         |
| `FONT_PATH`                 | No       | Path to game font (default: `alagard.ttf`)                   |
| `SYMBOL_FONT_PATH`          | No       | Path to symbol font (default: `NotoSansSymbols-Regular.ttf`) |
| `SHARD_ID`                  | No       | Shard ID for distributed sharding                            |
| `SHARD_COUNT`               | No       | Total shard count                                            |
| `GUILD_ID`                  | No       | Dev guild for command registration                           |

## Build

```bash
cargo build --release -p discordsh-bot
```

## Docker

```bash
docker build -f apps/discordsh/discordsh-bot/Dockerfile -t kbve/discordsh-bot .
```

## Related

- `apps/discordsh/axum-discordsh/` — HTTP server (Astro site, REST API)
- `apps/discordsh/discordsh-bot-e2e/` — E2E smoke tests
- `packages/rust/bevy/` — Game engine crates (items, inventory, battle, NPC, quests)
