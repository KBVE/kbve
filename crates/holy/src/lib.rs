//! Struct-level text cleaning.
//!
//! The point of this crate is that a cleaning rule lives next to the field it
//! applies to, rather than at each call site that happens to remember it:
//!
//! ```
//! use holy::Sanitize;
//!
//! #[derive(Sanitize)]
//! struct Registration {
//!     #[holy(sanitize = "trim,lowercase", validate = "email")]
//!     email: String,
//! }
//!
//! let mut form = Registration { email: "  User@Example.COM  ".into() };
//! assert!(form.sanitize().is_ok());
//! assert_eq!(form.email, "user@example.com");
//!
//! let mut bad = Registration { email: "not-an-email".into() };
//! let errors = bad.sanitize().unwrap_err();
//! assert_eq!(errors[0].field, "email");
//! ```
//!
//! Cleaning runs before checking, which is the only order that works: a field
//! of spaces has to be trimmed before `non_empty` can see it is empty.
//!
//! This is the facade. The derives come from `holy-derive`, and the code they
//! generate calls back into this crate. A proc-macro crate can export macros
//! and nothing else, which is why the two are separate -- the same split
//! `serde` and `thiserror` use.
pub mod validate;

pub use holy_derive::{Fuzz, Getters, Observer, Sanitize, Setters};
pub use validate::FieldError;
