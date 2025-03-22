use std::fs;
use tonic_build;

fn main() {
    let out_dir = "src/proto";

    fs::create_dir_all(out_dir).unwrap();

    tonic_build::configure()
        .out_dir(out_dir)
        .build_client(true)
        .build_server(true)
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize, Debug)]")
        // .field_attribute("status.StatusMessage.type", "#[bitflags]")
        .compile_protos(
            &["proto/temple.proto", "proto/groq.proto"],
            &["proto"],
        )
        .expect("Failed to compile Protobuf files");
}