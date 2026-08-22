//! Compile-time allowlist + runtime endpoint map for the WoW SOAP lane.
//!
//! ## Allowlist
//! Single source of truth lives at `packages/data/soap/commands.yaml` and is
//! baked into the binary with `include_str!`. Adding / changing a command
//! requires a rebuild — that's deliberate: the allowlist is a security
//! boundary, so a binary build IS the policy artifact.
//!
//! ## Endpoint env scheme
//! `SOAP_WOW_{SERVER}_{HOST|PORT|USER|PASSWORD}` — server upper-cased.
//! Example: `SOAP_WOW_MAIN_HOST` / `_PORT` / `_USER` / `_PASSWORD`.
//!
//! Unlike RCON there is no game axis — SOAP is a worldserver-only protocol —
//! so the key is the logical realm/server name alone. `_USER` and `_PASSWORD`
//! are a GM account's login, not a shared secret: the worldserver checks them
//! against the auth DB and gates each command on that account's seclevel.
//!
//! Endpoints are parsed once at startup. Zero configured endpoints is a valid
//! state, not a boot failure — it just means every exec 404s.

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use utoipa::ToSchema;

use crate::soap::transport::SoapEndpoint;

const WELL_KNOWN_SERVERS: &[&str] = &["MAIN"];
const DEFAULT_SOAP_PORT: u16 = 7878;

/// Blast radius of a command under the Agones worldserver Fleet.
///
/// The SOAP Service is a ClusterIP over `replicas: 2` with no session
/// affinity, and ToCloud9 assigns maps per-worldserver, so which pod answered
/// is not something the caller controls. `Realm` commands are shared-database
/// writes and read identically from any pod; `Node` commands report on — or
/// act on — only the sessions the answering pod happens to hold, and they fail
/// by returning a wrong answer rather than an error. Scope rides all the way
/// out to the exec response so the UI can say so.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum SoapScope {
    Realm,
    Node,
}

/// One allowlisted GM command. `template` is the dot-stripped command line —
/// the worldserver's SOAP handler prepends nothing and accepts no leading dot.
/// `scope` has no serde default on purpose: an entry that forgets to declare
/// its blast radius must fail the allowlist parse, not silently pick one.
#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct SoapCommandSpec {
    pub name: String,
    #[serde(default)]
    pub staff_only: bool,
    pub scope: SoapScope,
    pub template: String,
    #[serde(default)]
    pub arg_validators: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SoapCommandRegistryFile {
    commands: Vec<SoapCommandSpec>,
}

#[derive(Debug, Error)]
pub enum RegistryError {
    #[error("allowlist YAML parse: {0}")]
    YamlParse(#[from] serde_yaml::Error),

    #[error("duplicate command in allowlist: {name}")]
    DuplicateCommand { name: String },
}

const COMMANDS_YAML: &str = include_str!("../../../../../packages/data/soap/commands.yaml");

/// Resolved at startup: allowlist + endpoint table. Cheap to clone (Arc).
#[derive(Clone, Debug)]
pub struct SoapRegistry {
    commands: Arc<HashMap<String, SoapCommandSpec>>,
    endpoints: Arc<HashMap<String, SoapEndpoint>>,
}

impl SoapRegistry {
    /// Parse the baked YAML allowlist and the env-var endpoint table.
    /// Returns `Ok` even when no endpoints are configured — that just
    /// means every exec call will 404 until an env var is set.
    pub fn from_env() -> Result<Self, RegistryError> {
        let parsed: SoapCommandRegistryFile = serde_yaml::from_str(COMMANDS_YAML)?;

        let mut commands: HashMap<String, SoapCommandSpec> = HashMap::new();
        for spec in parsed.commands {
            if commands.contains_key(&spec.name) {
                return Err(RegistryError::DuplicateCommand { name: spec.name });
            }
            commands.insert(spec.name.clone(), spec);
        }

        Ok(Self {
            commands: Arc::new(commands),
            endpoints: Arc::new(parse_endpoints_from_env()),
        })
    }

    pub fn command(&self, name: &str) -> Option<&SoapCommandSpec> {
        self.commands.get(name)
    }

    pub fn endpoint(&self, server: &str) -> Option<&SoapEndpoint> {
        self.endpoints.get(&server.to_lowercase())
    }

    pub fn endpoint_count(&self) -> usize {
        self.endpoints.len()
    }

    pub fn command_count(&self) -> usize {
        self.commands.len()
    }
}

fn parse_endpoints_from_env() -> HashMap<String, SoapEndpoint> {
    let mut out = HashMap::new();
    for server in WELL_KNOWN_SERVERS {
        let Ok(host) = std::env::var(format!("SOAP_WOW_{server}_HOST")) else {
            continue;
        };
        let port: u16 = std::env::var(format!("SOAP_WOW_{server}_PORT"))
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(DEFAULT_SOAP_PORT);
        let user = std::env::var(format!("SOAP_WOW_{server}_USER")).unwrap_or_default();
        let password = std::env::var(format!("SOAP_WOW_{server}_PASSWORD")).unwrap_or_default();
        out.insert(
            server.to_lowercase(),
            SoapEndpoint::new(host, port, user, password),
        );
    }
    out
}

static SOAP_REGISTRY: OnceLock<SoapRegistry> = OnceLock::new();

/// Build + install the global registry. Returns the resolved registry so
/// `main.rs` can log a summary, and stashes it in a OnceLock so handlers
/// can pull it without threading through `AppState`.
pub fn init_soap_registry() -> Result<&'static SoapRegistry, RegistryError> {
    let reg = SoapRegistry::from_env()?;
    let _ = SOAP_REGISTRY.set(reg);
    Ok(SOAP_REGISTRY.get().expect("registry set above"))
}

pub fn get_soap_registry() -> Option<&'static SoapRegistry> {
    SOAP_REGISTRY.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlist_yaml_parses() {
        // The baked YAML must always be valid — a broken file should fail
        // builds, not panic at boot in prod.
        let parsed: SoapCommandRegistryFile =
            serde_yaml::from_str(COMMANDS_YAML).expect("packaged commands.yaml must parse");
        assert!(!parsed.commands.is_empty());
        assert!(parsed.commands.iter().any(|c| c.name == "server_info"));
        assert!(parsed.commands.iter().any(|c| c.name == "ban_account"));
    }

    #[test]
    fn every_entry_declares_a_scope() {
        // `scope` is non-Option and has no serde default, so a spec missing it
        // fails this parse outright — which is the point: a command whose
        // blast radius nobody thought about must not ship.
        let parsed: SoapCommandRegistryFile = serde_yaml::from_str(COMMANDS_YAML)
            .expect("every allowlist entry must declare a scope");
        assert_eq!(
            parsed
                .commands
                .iter()
                .filter(|c| c.scope == SoapScope::Realm)
                .count(),
            3
        );
        assert!(
            parsed
                .commands
                .iter()
                .any(|c| c.name == "kick" && c.scope == SoapScope::Node)
        );
    }

    #[test]
    fn missing_scope_fails_the_parse() {
        let yaml = "commands:\n  - name: x\n    staff_only: true\n    template: x\n";
        assert!(serde_yaml::from_str::<SoapCommandRegistryFile>(yaml).is_err());
    }

    #[test]
    fn scope_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&SoapScope::Realm).unwrap(),
            "\"realm\""
        );
        assert_eq!(serde_json::to_string(&SoapScope::Node).unwrap(), "\"node\"");
    }

    #[test]
    fn fleet_lifecycle_commands_stay_out_of_the_allowlist() {
        // Agones owns the GameServer lifecycle; a SOAP shutdown just bounces
        // whichever pod the ClusterIP happened to pick.
        let reg = SoapRegistry::from_env().unwrap();
        assert!(reg.command("server_shutdown").is_none());
        assert!(reg.command("server_restart").is_none());
    }

    #[test]
    fn every_allowlisted_command_is_staff_only() {
        let parsed: SoapCommandRegistryFile = serde_yaml::from_str(COMMANDS_YAML).unwrap();
        for c in parsed.commands {
            assert!(c.staff_only, "`{}` must be staff_only", c.name);
        }
    }

    #[test]
    fn no_template_carries_a_leading_dot_or_newline() {
        let parsed: SoapCommandRegistryFile = serde_yaml::from_str(COMMANDS_YAML).unwrap();
        for c in parsed.commands {
            assert!(!c.template.starts_with('.'), "`{}` leading dot", c.name);
            assert!(
                !c.template.contains(['\n', '\r']),
                "`{}` embeds a newline",
                c.name
            );
        }
    }

    #[test]
    fn registry_rejects_duplicate_command() {
        let spec = SoapCommandSpec {
            name: "server_info".into(),
            staff_only: true,
            scope: SoapScope::Node,
            template: "server info".into(),
            arg_validators: vec![],
        };
        let parsed = SoapCommandRegistryFile {
            commands: vec![spec.clone(), spec],
        };
        let mut seen: HashMap<String, SoapCommandSpec> = HashMap::new();
        let mut dup = false;
        for s in parsed.commands {
            if seen.contains_key(&s.name) {
                dup = true;
                break;
            }
            seen.insert(s.name.clone(), s);
        }
        assert!(dup);
    }

    #[test]
    fn zero_endpoints_is_not_an_error() {
        let reg = SoapRegistry::from_env().expect("registry builds without env");
        assert!(reg.command_count() > 0);
        assert!(reg.endpoint("nope").is_none());
    }
}
