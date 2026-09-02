// Header generation is behind the `bindgen` feature so an ordinary build --
// the server's, or any consumer linking the rlib -- neither compiles cbindgen
// nor writes into the source tree.
fn main() {
    #[cfg(feature = "bindgen")]
    generate();
}

#[cfg(feature = "bindgen")]
fn generate() {
    use std::path::PathBuf;

    let crate_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());

    // The header is checked in, not written to OUT_DIR: Unreal reads it through
    // the plugin's ThirdParty tree and must not need cargo to have run.
    // UNR_BINDGEN_OUT redirects it so the drift check can diff a fresh copy
    // against the committed one without touching the tree.
    let out = std::env::var("UNR_BINDGEN_OUT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| crate_dir.join("include").join("unr.h"));

    // Only src/ -- watching the crate dir would include the header this script
    // writes, and cargo would rebuild forever. The env line matters: without it
    // a cached build skips the script and the drift check writes nothing.
    println!("cargo:rerun-if-changed=src");
    println!("cargo:rerun-if-changed=cbindgen.toml");
    println!("cargo:rerun-if-env-changed=UNR_BINDGEN_OUT");

    match cbindgen::generate(&crate_dir) {
        Ok(bindings) => {
            bindings.write_to_file(&out);
        }
        Err(e) => panic!("cbindgen failed: {e}"),
    }
}
