//! Server-side twin of the herbmail client's world derivation.
//!
//! The client generates its dungeon from a seed and never transmits geometry, so
//! the server has to reach byte-identical results from the same seed or the two
//! disagree about where walls are. These primitives are the base of that: every
//! layer above (sector seeding, partitioning, corridor carving, doorway widths)
//! is built on them, so they are pinned against vectors asserted on both sides
//! before anything else is ported.

pub mod rng;
