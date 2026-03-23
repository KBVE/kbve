fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure()
        .build_server(true)
        .build_client(false)
        .compile_protos(
            &[
                "../../../packages/data/proto/ows/ows.proto",
                "proto/rows.proto",
            ],
            &["../../../packages/data/proto", "proto"],
        )?;
    Ok(())
}
