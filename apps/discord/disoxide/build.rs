use std::fs;
use tonic_build;

fn main() {
    let out_dir = "src/proto";

    fs::create_dir_all(out_dir).unwrap();

    tonic_build::configure()
        .out_dir(out_dir)
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .compile_protos(
            &["proto/user.proto", "proto/message.proto", "proto/store.proto"],
            &["proto"],
        )
        .expect("Failed to compile Protobuf files");
}

