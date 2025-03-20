use prost_build::Config;
use std::fs;

fn main() {
    let out_dir = "src/proto";

    fs::create_dir_all(out_dir).unwrap();

    let mut config = Config::new();
    config.out_dir(out_dir);

    config.type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]");

    config
        .compile_protos(
            &["proto/user.proto", "proto/message.proto", "proto/store.proto"],
            &["proto"],
        )
        .expect("Failed to compile Protobuf files");

}
