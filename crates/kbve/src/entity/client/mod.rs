pub mod ai;
#[cfg(feature = "supabase")]
pub mod github_store;
#[cfg(feature = "supabase")]
pub mod member;
#[cfg(feature = "legacy-sync-db")]
pub mod resend;
#[cfg(feature = "supabase")]
pub mod vault;

/// The PostgREST client, re-exported from `bevy_supa`.
///
/// This crate owned it first; `bevy_supa` was extracted from it so JNI and
/// game consumers could link a client without diesel / axum / tower. The copy
/// left behind here drifted into a duplicate, so the extraction is now the
/// only one. `SupabaseClient` stays as the local alias the callers already use.
#[cfg(feature = "supabase")]
pub use bevy_supa::{QueryBuilder, SupaClient as SupabaseClient, SupaError as SupabaseError};

pub use ai::*;
#[cfg(feature = "supabase")]
pub use github_store::*;
#[cfg(feature = "supabase")]
pub use member::*;
#[cfg(feature = "legacy-sync-db")]
pub use resend::*;
#[cfg(feature = "supabase")]
pub use vault::*;
