// ---------------------------------------------------------------------------
// Supabase Edge Function Client
//
// Mirrors the VaultClient pattern from packages/rust/kbve but uses ureq
// (sync HTTP, already in deps) wrapped in spawn_blocking.
//
// Env vars:
//   SUPABASE_URL              — e.g. "https://api.kbve.com"
//   SUPABASE_SERVICE_ROLE_KEY — service role JWT
//   MC_SERVER_ID              — server identifier, default "kbve-mc-1"
// ---------------------------------------------------------------------------

use std::sync::LazyLock;

use crate::stats::CharacterData;

// ---------------------------------------------------------------------------
// Configuration (read once from env)
// ---------------------------------------------------------------------------

static SUPABASE_URL: LazyLock<Option<String>> =
    LazyLock::new(|| std::env::var("SUPABASE_URL").ok().filter(|s| !s.is_empty()));

static SERVICE_KEY: LazyLock<Option<String>> = LazyLock::new(|| {
    std::env::var("SUPABASE_SERVICE_ROLE_KEY")
        .ok()
        .filter(|s| !s.is_empty())
});

pub static MC_SERVER_ID: LazyLock<String> = LazyLock::new(|| {
    std::env::var("MC_SERVER_ID")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "kbve-mc-1".to_string())
});

/// Returns `true` if both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
pub fn is_configured() -> bool {
    SUPABASE_URL.is_some() && SERVICE_KEY.is_some()
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

pub struct AddXpResult {
    pub new_level: i32,
    pub total_experience: i64,
    pub leveled_up: bool,
}

// ---------------------------------------------------------------------------
// Core HTTP helper (blocking, runs inside spawn_blocking)
// ---------------------------------------------------------------------------

fn edge_post(command: &str, extra: serde_json::Value) -> Result<serde_json::Value, String> {
    let url = SUPABASE_URL
        .as_deref()
        .ok_or("Edge functions not configured (SUPABASE_URL not set)")?;
    let key = SERVICE_KEY
        .as_deref()
        .ok_or("Edge functions not configured (SUPABASE_SERVICE_ROLE_KEY not set)")?;

    let endpoint = format!("{}/functions/v1/mc", url.trim_end_matches('/'));

    let mut body = match extra {
        serde_json::Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };
    body.insert(
        "command".to_string(),
        serde_json::Value::String(command.to_string()),
    );

    let resp = ureq::post(&endpoint)
        .header("Authorization", &format!("Bearer {key}"))
        .header("apikey", key)
        .header("Content-Type", "application/json")
        .send_json(&serde_json::Value::Object(body))
        .map_err(|e| format!("Edge request failed: {e}"))?;

    let text = resp
        .into_body()
        .read_to_string()
        .map_err(|e| format!("Failed to read edge response: {e}"))?;

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse edge response: {e} — body: {text}"))
}

// ---------------------------------------------------------------------------
// Public async API
// ---------------------------------------------------------------------------

/// Load a character from the edge function. Returns `None` if not found.
pub async fn load_character(player_uuid: &str) -> Result<Option<CharacterData>, String> {
    let uuid = player_uuid.to_string();
    let server_id = MC_SERVER_ID.clone();

    let result = tokio::task::spawn_blocking(move || {
        edge_post(
            "character.load",
            serde_json::json!({
                "player_uuid": uuid,
                "server_id": server_id,
            }),
        )
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let json = result?;

    let found = json.get("found").and_then(|v| v.as_bool()).unwrap_or(false);

    if !found {
        return Ok(None);
    }

    let character = json
        .get("character")
        .ok_or("Edge response missing 'character' field")?;

    Ok(Some(CharacterData::from_edge_json(character)))
}

/// Save a character to the edge function.
pub async fn save_character(player_uuid: &str, data: &CharacterData) -> Result<(), String> {
    let uuid = player_uuid.to_string();
    let server_id = MC_SERVER_ID.clone();
    let data = data.clone();

    let result = tokio::task::spawn_blocking(move || {
        edge_post(
            "character.save",
            serde_json::json!({
                "character": {
                    "player_uuid": uuid,
                    "server_id": server_id,
                    "experience": data.experience,
                    "base_stats": {
                        "strength": data.strength,
                        "dexterity": data.dexterity,
                        "constitution": data.constitution,
                        "intelligence": data.intelligence,
                        "wisdom": data.wisdom,
                        "charisma": data.charisma,
                    }
                }
            }),
        )
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let json = result?;

    let success = json
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !success {
        let err = json
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("character.save failed: {err}"));
    }

    Ok(())
}

/// Add XP to a character via the edge function (atomic level-up).
pub async fn add_xp(player_uuid: &str, amount: i64) -> Result<AddXpResult, String> {
    let uuid = player_uuid.to_string();
    let server_id = MC_SERVER_ID.clone();

    let result = tokio::task::spawn_blocking(move || {
        edge_post(
            "character.add_xp",
            serde_json::json!({
                "player_uuid": uuid,
                "server_id": server_id,
                "xp_amount": amount,
            }),
        )
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let json = result?;

    let success = json
        .get("success")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if !success {
        let err = json
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown error");
        return Err(format!("character.add_xp failed: {err}"));
    }

    Ok(AddXpResult {
        new_level: json.get("new_level").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
        total_experience: json
            .get("total_experience")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        leveled_up: json
            .get("leveled_up")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    })
}
