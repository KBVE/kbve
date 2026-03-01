use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Proto file locations
    // Docker/CI: /proto/kbve/
    // Monorepo local dev: ../../../packages/data/proto/kbve/
    let docker_proto_dir = Path::new("/proto/kbve");
    let local_proto_dir = Path::new("../../../packages/data/proto/kbve");

    let (proto_dir, include_dir) = if docker_proto_dir.exists() {
        (docker_proto_dir, Path::new("/proto"))
    } else if local_proto_dir.exists() {
        (local_proto_dir, Path::new("../../../packages/data/proto"))
    } else {
        println!("cargo:warning=Proto directory not found, skipping protobuf compilation");
        return Ok(());
    };

    let proto_files = vec![
        proto_dir.join("common.proto"),
        proto_dir.join("enums.proto"),
        proto_dir.join("snapshot.proto"),
        proto_dir.join("pool.proto"),
        proto_dir.join("schema.proto"),
        proto_dir.join("osrs.proto"),
    ];

    for proto in &proto_files {
        if !proto.exists() {
            println!("cargo:warning=Proto file not found: {:?}", proto);
            return Ok(());
        }
    }

    prost_build::Config::new().compile_protos(
        &proto_files.iter().map(|p| p.as_path()).collect::<Vec<_>>(),
        &[include_dir],
    )?;

    for proto in &proto_files {
        println!("cargo:rerun-if-changed={}", proto.display());
    }

    Ok(())
}
