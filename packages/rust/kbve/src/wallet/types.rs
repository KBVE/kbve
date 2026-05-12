//! Rust mirrors of the `wallet` schema enums and rowtypes.
//!
//! Enum text values match the Postgres ENUM labels exactly so they can be
//! passed as TEXT bind params and cast server-side
//! (`$N::wallet.currency_kind`). Keep these in sync with the SQL schema.

use chrono::{DateTime, Utc};
use diesel::deserialize::{self, FromSql};
use diesel::pg::{Pg, PgValue};
use diesel::serialize::{self, IsNull, Output, ToSql};
use diesel::sql_types::Text;
use serde::{Deserialize, Serialize};
use std::io::Write;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

macro_rules! pg_text_enum {
    (
        $(#[$enum_meta:meta])*
        $name:ident {
            $( $(#[$var_meta:meta])* $variant:ident => $label:literal ),+ $(,)?
        }
    ) => {
        $(#[$enum_meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(rename_all = "snake_case")]
        pub enum $name {
            $( $(#[$var_meta])* $variant ),+
        }

        impl $name {
            /// Postgres ENUM label.
            pub fn as_pg(self) -> &'static str {
                match self {
                    $( $name::$variant => $label ),+
                }
            }

            pub fn from_pg(s: &str) -> Option<Self> {
                match s {
                    $( $label => Some($name::$variant) ),+,
                    _ => None,
                }
            }
        }

        impl ToSql<Text, Pg> for $name {
            fn to_sql<'b>(&'b self, out: &mut Output<'b, '_, Pg>) -> serialize::Result {
                out.write_all(self.as_pg().as_bytes())?;
                Ok(IsNull::No)
            }
        }

        impl FromSql<Text, Pg> for $name {
            fn from_sql(value: PgValue<'_>) -> deserialize::Result<Self> {
                let s = std::str::from_utf8(value.as_bytes())?;
                $name::from_pg(s).ok_or_else(|| {
                    format!("unknown {} value: {s}", stringify!($name)).into()
                })
            }
        }
    };
}

pg_text_enum! {
    /// `wallet.currency_kind`
    CurrencyKind {
        Credits => "credits",
        Khash   => "khash",
    }
}

pg_text_enum! {
    /// `wallet.account_kind`
    AccountKind {
        User     => "user",
        Guild    => "guild",
        Treasury => "treasury",
        Escrow   => "escrow",
        System   => "system",
    }
}

pg_text_enum! {
    /// `wallet.source_kind`
    SourceKind {
        Reward     => "reward",
        Purchase   => "purchase",
        Refund     => "refund",
        Admin      => "admin",
        Coupon     => "coupon",
        MarketBuy  => "market_buy",
        MarketSell => "market_sell",
        MarketFee  => "market_fee",
        Transfer   => "transfer",
    }
}

pg_text_enum! {
    /// `wallet.reward_kind`
    RewardKind {
        Credits     => "credits",
        Khash       => "khash",
        GrantItems  => "grant_items",
        WalletPromo => "wallet_promo",
    }
}

pg_text_enum! {
    /// `wallet.coupon_status`
    CouponStatus {
        Unredeemed => "unredeemed",
        Redeemed   => "redeemed",
        Expired    => "expired",
        Revoked    => "revoked",
    }
}

// ---------------------------------------------------------------------------
// Request payloads (input to service ops)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditRequest {
    pub account_id: Uuid,
    pub currency: CurrencyKind,
    pub amount: i64,
    pub source_kind: SourceKind,
    pub reason: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    pub idempotency_key: Uuid,
}

pub type DebitRequest = CreditRequest;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferRequest {
    pub from_account: Uuid,
    pub to_account: Uuid,
    pub currency: CurrencyKind,
    pub amount: i64,
    pub source_kind: SourceKind,
    pub reason: Option<String>,
    pub ref_type: Option<String>,
    pub ref_id: Option<i64>,
    pub idempotency_key: Uuid,
}

// ---------------------------------------------------------------------------
// Response rows
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BalanceRow {
    pub account_id: Uuid,
    pub credits: i64,
    pub khash: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CouponSummary {
    pub coupon_id: i64,
    pub template_code: String,
    pub template_label: String,
    pub reward_kind: RewardKind,
    pub reward_payload: serde_json::Value,
    pub status: CouponStatus,
    pub granted_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub redeemed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedeemResult {
    pub success: bool,
    pub reward_kind: RewardKind,
    pub reward_payload: serde_json::Value,
    pub ledger_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyBalanceRow {
    pub account_id: Uuid,
    pub stored_credits: i64,
    pub ledger_credits: i64,
    pub stored_khash: i64,
    pub ledger_khash: i64,
    pub ok: bool,
}
