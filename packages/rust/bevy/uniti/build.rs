use std::path::Path;

fn main() {
    let proto_root = Path::new("../../../data/proto");
    let unity_target =
        Path::new("../../../../apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/Native");

    if !proto_root.exists() {
        println!(
            "cargo:warning=uniti: out-of-tree proto sources not found; using pre-committed src/proto/*.rs"
        );
        return;
    }

    let protoc_path = protoc_bin_vendored::protoc_bin_path()
        .expect("protoc-bin-vendored could not locate a protoc binary for this host");
    unsafe {
        std::env::set_var("PROTOC", protoc_path);
    }

    prost_build::Config::new()
        .out_dir("src/proto")
        .compile_protos(
            &[
                "../../../data/proto/empire/empire.proto",
                "../../../data/proto/kbve/common.proto",
            ],
            &["../../../data/proto"],
        )
        .expect("prost-build empire.proto failed");

    if !unity_target.exists() {
        println!(
            "cargo:warning=uniti: Unity target dir not present; skipping csbindgen Uniti.g.cs emission"
        );
        return;
    }

    csbindgen::Builder::default()
        .input_extern_file("src/lib.rs")
        .input_extern_file("src/ffi_empire.rs")
        .input_extern_file("src/ffi_inventory.rs")
        .input_extern_file("src/ffi_pathfinding.rs")
        .input_extern_file("src/ffi_world.rs")
        .csharp_dll_name("uniti")
        .csharp_dll_name_if("UNITY_IOS && !UNITY_EDITOR", "__Internal")
        .csharp_namespace("RareIcon.Native")
        .csharp_class_name("Uniti")
        .csharp_class_accessibility("public")
        .csharp_use_function_pointer(false)
        .generate_csharp_file(
            "../../../../apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/Native/Uniti.g.cs",
        )
        .unwrap();
}
