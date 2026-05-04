fn main() {
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
