//! Result shapes returned by the referral client.

use chrono::{DateTime, Utc};
use diesel::QueryableByName;
use diesel::sql_types::{BigInt, Bool, Text, Timestamptz};
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

// ---------------------------------------------------------------------------
// Phase 3a — user-target management
// ---------------------------------------------------------------------------

/// Row returned by `referral.service_list_user_targets`. One per
/// (user, target) regardless of active state so the UI can show
/// disabled entries with a re-enable affordance.
#[derive(Debug, QueryableByName)]
pub struct UserTargetRow {
    #[diesel(sql_type = Text)]
    pub target_slug: String,
    #[diesel(sql_type = Text)]
    pub title: String,
    #[diesel(sql_type = Text)]
    pub url: String,
    #[diesel(sql_type = Bool)]
    pub is_default: bool,
    #[diesel(sql_type = Bool)]
    pub active: bool,
    #[diesel(sql_type = Timestamptz)]
    pub enabled_at: DateTime<Utc>,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub disabled_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Timestamptz)]
    pub updated_at: DateTime<Utc>,
    #[diesel(sql_type = BigInt)]
    pub clicks_total: i64,
    #[diesel(sql_type = BigInt)]
    pub clicks_credited: i64,
    #[diesel(sql_type = BigInt)]
    pub credits_total: i64,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub last_click_at: Option<DateTime<Utc>>,
}

/// Serializable mirror of UserTargetRow for the HTTP response.
#[derive(Debug, Serialize, Clone)]
pub struct UserTargetView {
    pub target_slug: String,
    pub title: String,
    pub url: String,
    pub is_default: bool,
    pub active: bool,
    pub enabled_at: DateTime<Utc>,
    pub disabled_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub clicks_total: i64,
    pub clicks_credited: i64,
    pub credits_total: i64,
    pub last_click_at: Option<DateTime<Utc>>,
}

impl From<UserTargetRow> for UserTargetView {
    fn from(r: UserTargetRow) -> Self {
        Self {
            target_slug: r.target_slug,
            title: r.title,
            url: r.url,
            is_default: r.is_default,
            active: r.active,
            enabled_at: r.enabled_at,
            disabled_at: r.disabled_at,
            updated_at: r.updated_at,
            clicks_total: r.clicks_total,
            clicks_credited: r.clicks_credited,
            credits_total: r.credits_total,
            last_click_at: r.last_click_at,
        }
    }
}

/// Row shape returned by `referral.service_enable_target` and
/// `referral.service_set_default_target`. Carries the affected row's
/// fields PLUS the slug that lost the default (NULL when no demotion
/// happened) so callers can refresh cache state without a follow-up
/// list call.
#[derive(Debug, QueryableByName)]
pub struct UserTargetMutationRow {
    #[diesel(sql_type = Text)]
    pub target_slug: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<Text>)]
    pub demoted_target_slug: Option<String>,
    #[diesel(sql_type = Bool)]
    pub is_default: bool,
    #[diesel(sql_type = Bool)]
    pub active: bool,
    #[diesel(sql_type = Timestamptz)]
    pub enabled_at: DateTime<Utc>,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub disabled_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Timestamptz)]
    pub updated_at: DateTime<Utc>,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub demoted_updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct UserTargetMutation {
    pub target_slug: String,
    pub demoted_target_slug: Option<String>,
    pub is_default: bool,
    pub active: bool,
    pub enabled_at: DateTime<Utc>,
    pub disabled_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub demoted_updated_at: Option<DateTime<Utc>>,
}

impl From<UserTargetMutationRow> for UserTargetMutation {
    fn from(r: UserTargetMutationRow) -> Self {
        Self {
            target_slug: r.target_slug,
            demoted_target_slug: r.demoted_target_slug,
            is_default: r.is_default,
            active: r.active,
            enabled_at: r.enabled_at,
            disabled_at: r.disabled_at,
            updated_at: r.updated_at,
            demoted_updated_at: r.demoted_updated_at,
        }
    }
}

/// Row shape returned by `referral.service_disable_target`. Carries the
/// disabled row's fields PLUS the slug that inherited the default
/// (NULL when no promotion happened) so callers can refresh local UI
/// state without a follow-up list call.
#[derive(Debug, QueryableByName)]
pub struct DisableTargetRow {
    #[diesel(sql_type = Text)]
    pub target_slug: String,
    #[diesel(sql_type = diesel::sql_types::Nullable<Text>)]
    pub promoted_target_slug: Option<String>,
    #[diesel(sql_type = Bool)]
    pub is_default: bool,
    #[diesel(sql_type = Bool)]
    pub active: bool,
    #[diesel(sql_type = Timestamptz)]
    pub enabled_at: DateTime<Utc>,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub disabled_at: Option<DateTime<Utc>>,
    #[diesel(sql_type = Timestamptz)]
    pub updated_at: DateTime<Utc>,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub promoted_updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DisableTargetOutcome {
    pub target_slug: String,
    pub promoted_target_slug: Option<String>,
    pub is_default: bool,
    pub active: bool,
    pub enabled_at: DateTime<Utc>,
    pub disabled_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub promoted_updated_at: Option<DateTime<Utc>>,
}

impl From<DisableTargetRow> for DisableTargetOutcome {
    fn from(r: DisableTargetRow) -> Self {
        Self {
            target_slug: r.target_slug,
            promoted_target_slug: r.promoted_target_slug,
            is_default: r.is_default,
            active: r.active,
            enabled_at: r.enabled_at,
            disabled_at: r.disabled_at,
            updated_at: r.updated_at,
            promoted_updated_at: r.promoted_updated_at,
        }
    }
}

#[derive(Debug, QueryableByName)]
pub struct UserStatsRow {
    #[diesel(sql_type = BigInt)]
    pub clicks_total: i64,
    #[diesel(sql_type = BigInt)]
    pub clicks_credited: i64,
    #[diesel(sql_type = BigInt)]
    pub credits_total: i64,
    #[diesel(sql_type = diesel::sql_types::Nullable<Timestamptz>)]
    pub last_click_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct UserStats {
    pub clicks_total: i64,
    pub clicks_credited: i64,
    pub credits_total: i64,
    pub last_click_at: Option<DateTime<Utc>>,
}

impl From<UserStatsRow> for UserStats {
    fn from(r: UserStatsRow) -> Self {
        Self {
            clicks_total: r.clicks_total,
            clicks_credited: r.clicks_credited,
            credits_total: r.credits_total,
            last_click_at: r.last_click_at,
        }
    }
}
