// lib.rs

// Make the macro modules public so they are accessible to users of your crate
pub mod getters;
pub mod setters;

// Optionally, re-export the macros at the crate level for easier use
pub use getters::*;
pub use setters::*;