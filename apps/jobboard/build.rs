fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("BUILD_PROTO").is_err() {
        println!("cargo:warning=Skipping protobuf compilation (BUILD_PROTO not set)");
        return Ok(());
    }

    let proto_root = "../../packages/data/proto";
    let out_dir = "src/proto";
    std::fs::create_dir_all(out_dir)?;

    prost_build::Config::new().out_dir(out_dir).compile_protos(
        &[format!("{proto_root}/jobboard/jobboard.proto")],
        &[proto_root.to_string()],
    )?;

    println!("cargo:warning=Protobuf compilation complete (jobboard)");
    Ok(())
}
