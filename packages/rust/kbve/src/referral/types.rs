//! Result shapes returned by the referral client.

use diesel::QueryableByName;
use diesel::sql_types::{BigInt, Bool, Text};
use serde::Serialize;
use uuid::Uuid;

/// Mirror of the `referral.record_click` return row.
#[derive(Debug, QueryableByName)]
pub struct RecordClickRow {
    #[diesel(sql_type = BigInt)]
    pub click_id: i64,
    #[diesel(sql_type = Text)]
    pub target_slug: String,
    #[diesel(sql_type = Text)]
    pub target_url: String,
    #[diesel(sql_type = Bool)]
    pub qualified: bool,
    #[diesel(sql_type = Bool)]
    pub credited: bool,
    #[diesel(sql_type = diesel::sql_types::Nullable<BigInt>)]
    pub ledger_id: Option<i64>,
}

/// What the axum handler returns to its caller (decoupled from the
/// QueryableByName row so the response shape can drift independently).
#[derive(Debug, Serialize, Clone)]
pub struct RecordClickOutcome {
    pub click_id: i64,
    pub target_slug: String,
    pub target_url: String,
    pub qualified: bool,
    pub credited: bool,
    pub ledger_id: Option<i64>,
}

impl From<RecordClickRow> for RecordClickOutcome {
    fn from(r: RecordClickRow) -> Self {
        Self {
            click_id: r.click_id,
            target_slug: r.target_slug,
            target_url: r.target_url,
            qualified: r.qualified,
            credited: r.credited,
            ledger_id: r.ledger_id,
        }
    }
}

/// Mirror of the `referral.resolve_user_target` return row.
#[derive(Debug, QueryableByName)]
pub struct ResolvedTargetRow {
    #[diesel(sql_type = Text)]
    pub slug: String,
    #[diesel(sql_type = Text)]
    pub title: String,
    #[diesel(sql_type = Text)]
    pub url: String,
}

/// Inputs the handler builds before calling `record_click`.
#[derive(Debug, Clone)]
pub struct RecordClickInput {
    pub referrer_id: Uuid,
    pub target_slug: String,
    pub ip_hash: Vec<u8>,
    pub subnet_hash: Vec<u8>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub accept_lang: Option<String>,
}
