extern crate prost_build;
use std::fs;

fn main() {
    let out_dir = "src/proto";
    fs::create_dir_all(out_dir).unwrap(); // Safety*
    prost_build::Config::new()
    .out_dir(out_dir)
    .compile_protos(
        &["proto/user.proto", "proto/message.proto"],
        &["proto/"],
    ).expect("Failed to compile Protobuf files");
}