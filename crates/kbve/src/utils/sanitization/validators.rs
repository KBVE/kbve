//! Re-exports of the validator builder from `jedi`.
//!
//! This module used to hold its own `ValidatorBuilder`, a second
//! implementation of the one in `jedi`. Nothing referenced it: every caller in
//! this crate -- sheet.rs, character_handler.rs, session/state.rs -- already
//! imported `jedi::builder::ValidatorBuilder`, so the copy here was 169 lines
//! that compiled and did nothing.
//!
//! Re-exported rather than deleted outright, so anything resolving these names
//! through `utils::sanitization` keeps working. `jedi`'s version is also the
//! generic one: `ValidatorBuilder<T, E>` against this crate's
//! `ValidatorBuilder<T>`.
pub use jedi::builder::{ValidatorBuilder, validate_only_input_password_without_regex};
