fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Only recompile protos when BUILD_PROTO is set.
    // CI and normal builds use the vendored files in src/proto/.
    // Run `BUILD_PROTO=1 cargo build -p rows` to regenerate after .proto changes.
    if std::env::var("BUILD_PROTO").is_err() {
        println!("cargo:warning=Skipping protobuf compilation (BUILD_PROTO not set)");
        return Ok(());
    }

    let out_dir = "src/proto";
    std::fs::create_dir_all(out_dir)?;

    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .out_dir(out_dir)
        .compile_protos(
            &[
                "../../../packages/data/proto/ows/ows.proto",
                "proto/rows.proto",
            ],
            &["../../../packages/data/proto", "proto"],
        )?;
    Ok(())
}
