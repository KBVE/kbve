//! Compile-time allowlist + runtime endpoint map.
//!
//! ## Allowlist
//! Single source of truth lives at `packages/data/rcon/commands.yaml` and is
//! baked into the binary with `include_str!`. Adding / changing a command
//! requires a rebuild — that's deliberate: the allowlist is a security
//! boundary, so a binary build IS the policy artifact.
//!
//! ## Endpoint env scheme
//! `RCON_{GAME}_{SERVER}_{HOST|PORT|PASSWORD}` — game and server upper-cased.
//! Examples:
//!   `RCON_MC_LOBBY_HOST` / `_PORT` / `_PASSWORD`
//!   `RCON_FACTORIO_MAIN_HOST` / `_PORT` / `_PASSWORD`
//!
//! Endpoints are parsed once at startup. The legacy `MC_RCON_*` scheme used
//! by `src/db/mc.rs` polling stays untouched — both schemes can coexist
//! without one leaking into the other.

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use jedi::rcon::RconEndpoint;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use utoipa::ToSchema;

/// `kbve.rcon.Game` mirror. Serialized lowercase to match the proto enum's
/// stripped form (`GAME_MC` → `"mc"`).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Game {
    Mc,
    Factorio,
}

impl Game {
    fn env_prefix(self) -> &'static str {
        match self {
            Game::Mc => "MC",
            Game::Factorio => "FACTORIO",
        }
    }

    fn well_known_servers(self) -> &'static [&'static str] {
        match self {
            Game::Mc => &["VELOCITY", "LOBBY", "SURVIVAL"],
            Game::Factorio => &["MAIN"],
        }
    }

    const ALL: &'static [Game] = &[Game::Mc, Game::Factorio];
}

/// One allowlisted command (`kbve.rcon.RconCommandSpec`).
#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct RconCommandSpec {
    pub game: Game,
    pub name: String,
    #[serde(default)]
    pub staff_only: bool,
    pub template: String,
    #[serde(default)]
    pub arg_validators: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct RconCommandRegistryFile {
    commands: Vec<RconCommandSpec>,
}

#[derive(Debug, Error)]
pub enum RegistryError {
    #[error("allowlist YAML parse: {0}")]
    YamlParse(#[from] serde_yaml::Error),

    #[error("duplicate command in allowlist: {game:?}/{name}")]
    DuplicateCommand { game: Game, name: String },
}

const COMMANDS_YAML: &str = include_str!("../../../../../packages/data/rcon/commands.yaml");

/// Resolved at startup: allowlist + endpoint table. Cheap to clone (Arc).
#[derive(Clone, Debug)]
pub struct RconRegistry {
    commands: Arc<HashMap<(Game, String), RconCommandSpec>>,
    endpoints: Arc<HashMap<(Game, String), RconEndpoint>>,
}

impl RconRegistry {
    /// Parse the baked YAML allowlist and the env-var endpoint table.
    /// Returns `Ok` even when no endpoints are configured — that just
    /// means every exec call will 404 until an env var is set.
    pub fn from_env() -> Result<Self, RegistryError> {
        let parsed: RconCommandRegistryFile = serde_yaml::from_str(COMMANDS_YAML)?;

        let mut commands: HashMap<(Game, String), RconCommandSpec> = HashMap::new();
        for spec in parsed.commands {
            let key = (spec.game, spec.name.clone());
            if commands.contains_key(&key) {
                return Err(RegistryError::DuplicateCommand {
                    game: spec.game,
                    name: spec.name,
                });
            }
            commands.insert(key, spec);
        }

        Ok(Self {
            commands: Arc::new(commands),
            endpoints: Arc::new(parse_endpoints_from_env()),
        })
    }

    pub fn command(&self, game: Game, name: &str) -> Option<&RconCommandSpec> {
        self.commands.get(&(game, name.to_string()))
    }

    pub fn endpoint(&self, game: Game, server: &str) -> Option<&RconEndpoint> {
        self.endpoints.get(&(game, server.to_lowercase()))
    }

    pub fn endpoint_count(&self) -> usize {
        self.endpoints.len()
    }

    pub fn command_count(&self) -> usize {
        self.commands.len()
    }
}

fn parse_endpoints_from_env() -> HashMap<(Game, String), RconEndpoint> {
    let mut out = HashMap::new();
    for game in Game::ALL {
        let game_prefix = game.env_prefix();
        for server in game.well_known_servers() {
            let host_var = format!("RCON_{game_prefix}_{server}_HOST");
            let Ok(host) = std::env::var(&host_var) else {
                continue;
            };
            let port: u16 = std::env::var(format!("RCON_{game_prefix}_{server}_PORT"))
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(default_port(*game));
            let password =
                std::env::var(format!("RCON_{game_prefix}_{server}_PASSWORD")).unwrap_or_default();
            out.insert(
                (*game, server.to_lowercase()),
                RconEndpoint::new(host, port, password),
            );
        }
    }
    out
}

fn default_port(game: Game) -> u16 {
    match game {
        Game::Mc => 25575,
        Game::Factorio => 27015,
    }
}

static RCON_REGISTRY: OnceLock<RconRegistry> = OnceLock::new();

/// Build + install the global registry. Returns the resolved registry so
/// `main.rs` can log a summary, and stashes it in a OnceLock so handlers
/// can pull it without threading through `AppState`.
pub fn init_rcon_registry() -> Result<&'static RconRegistry, RegistryError> {
    let reg = RconRegistry::from_env()?;
    let _ = RCON_REGISTRY.set(reg);
    Ok(RCON_REGISTRY.get().expect("registry set above"))
}

pub fn get_rcon_registry() -> Option<&'static RconRegistry> {
    RCON_REGISTRY.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_yaml_parses() {
        // The baked YAML must always be valid — a broken file should fail
        // builds, not panic at boot in prod.
        let parsed: RconCommandRegistryFile =
            serde_yaml::from_str(COMMANDS_YAML).expect("packaged commands.yaml must parse");
        assert!(!parsed.commands.is_empty());
        assert!(
            parsed
                .commands
                .iter()
                .any(|c| c.game == Game::Mc && c.name == "list")
        );
        assert!(
            parsed
                .commands
                .iter()
                .any(|c| c.game == Game::Factorio && c.name == "silent_command" && c.staff_only)
        );
    }

    #[test]
    fn registry_rejects_duplicate_command() {
        let mut commands: HashMap<(Game, String), RconCommandSpec> = HashMap::new();
        let spec = RconCommandSpec {
            game: Game::Mc,
            name: "list".into(),
            staff_only: false,
            template: "list".into(),
            arg_validators: vec![],
        };
        commands.insert((Game::Mc, "list".into()), spec.clone());

        let parsed = RconCommandRegistryFile {
            commands: vec![spec.clone(), spec],
        };
        let mut seen: HashMap<(Game, String), RconCommandSpec> = HashMap::new();
        let mut dup = false;
        for s in parsed.commands {
            let k = (s.game, s.name.clone());
            if seen.contains_key(&k) {
                dup = true;
                break;
            }
            seen.insert(k, s);
        }
        assert!(dup);
    }
}
