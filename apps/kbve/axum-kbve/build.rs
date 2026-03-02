use std::fs;
use std::path::Path;
use std::process::Command;

/// Proto module names that src/proto/mod.rs expects via include!()
const PROTO_MODULES: &[&str] = &[
    "kbve.common",
    "kbve.enums",
    "kbve.snapshot",
    "kbve.pool",
    "kbve.schema",
    "kbve.osrs",
];

fn protoc_available() -> bool {
    Command::new("protoc")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Write empty stubs so `include!(concat!(env!("OUT_DIR"), "/kbve.X.rs"))` compiles
fn write_proto_stubs(out_dir: &str) {
    for module in PROTO_MODULES {
        let path = Path::new(out_dir).join(format!("{module}.rs"));
        if !path.exists() {
            let _ = fs::write(
                &path,
                "// proto stub — protoc was not available at build time\n",
            );
        }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let out_dir = std::env::var("OUT_DIR").unwrap();

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
        write_proto_stubs(&out_dir);
        return Ok(());
    };

    if !protoc_available() {
        println!("cargo:warning=protoc not found, skipping protobuf compilation");
        write_proto_stubs(&out_dir);
        return Ok(());
    }

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
            write_proto_stubs(&out_dir);
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
