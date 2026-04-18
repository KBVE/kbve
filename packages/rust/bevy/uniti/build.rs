fn main() {
    csbindgen::Builder::default()
        .input_extern_file("src/lib.rs")
        .input_extern_file("src/ffi_pathfinding.rs")
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
