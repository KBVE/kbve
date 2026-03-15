use std::fs;
use std::path::PathBuf;

fn main() {
    if std::env::var("BUILD_PROTO").is_err() {
        println!("cargo:warning=Skipping protobuf compilation (BUILD_PROTO not set)");
        return;
    }

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());

    // Walk up to the workspace root (4 levels: bevy_mapdb → bevy → rust → packages → root)
    let workspace_root = manifest_dir
        .ancestors()
        .nth(4)
        .expect("Cannot find workspace root");
    let proto_root = workspace_root.join("packages/data/proto");

    assert!(
        proto_root.exists(),
        "Proto root not found at: {}",
        proto_root.display()
    );

    let map_proto = proto_root.join("map/mapdb.proto");
    let out_dir = manifest_dir.join("src/proto");
    fs::create_dir_all(&out_dir).unwrap();

    prost_build::Config::new()
        .out_dir(&out_dir)
        .type_attribute(".map", "#[derive(serde::Serialize, serde::Deserialize)]")
        .compile_protos(
            &[map_proto.to_str().unwrap()],
            &[
                proto_root.join("map").to_str().unwrap(),
                proto_root.to_str().unwrap(),
            ],
        )
        .expect("Failed to compile mapdb.proto");
}
