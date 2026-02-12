use std::fs;
use tonic_build;

fn main() {
    let out_dir = "src/proto";

    fs::create_dir_all(out_dir).unwrap();

    tonic_build::configure()
        .out_dir(out_dir)
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        // .field_attribute("status.StatusMessage.type", "#[bitflags]")
        .compile_protos(
            &[
                "../../../packages/data/proto/disoxide/user.proto",
                "../../../packages/data/proto/disoxide/message.proto",
                "../../../packages/data/proto/disoxide/store.proto",
                "../../../packages/data/proto/disoxide/status.proto",
            ],
            &["../../../packages/data/proto/disoxide"],
        )
        .expect("Failed to compile Protobuf files");
}

