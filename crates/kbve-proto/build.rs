use std::path::PathBuf;

/// Turns a missing generated tree into an instruction instead of a stat error.
///
/// `src/lib.rs` `include!`s a gitignored file that `protobuf:build` writes. A
/// clean checkout therefore fails on a path nobody recognises, several frames
/// deep in whichever crate pulled this one in. Naming the command here costs a
/// stat per build and saves that search.
fn main() {
    let generated =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../packages/proto/gen/rust/mod.rs");

    println!("cargo::rerun-if-changed={}", generated.display());

    if !generated.exists() {
        println!(
            "cargo::error=kbve-proto: generated protobuf tree is missing. \
             Run `moon run protobuf:build` (it writes packages/proto/gen/, \
             which is gitignored and has no build-script fallback)."
        );
    }
}
