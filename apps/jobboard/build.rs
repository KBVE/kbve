fn main() -> Result<(), Box<dyn std::error::Error>> {
    if std::env::var("BUILD_PROTO").is_err() {
        println!("cargo:warning=Skipping protobuf compilation (BUILD_PROTO not set)");
        return Ok(());
    }

    let proto_root = "../../packages/data/proto";
    let out_dir = "src/proto";
    std::fs::create_dir_all(out_dir)?;

    let mut config = prost_build::Config::new();
    config.out_dir(out_dir);
    for msg in [
        "ProfileLink",
        "ProfileDraft",
        "MembershipApplicationView",
        "AdminApplicationView",
        "SubmitApplicationInput",
        "DecisionInput",
    ] {
        config.type_attribute(
            format!(".jobboard.{msg}"),
            "#[derive(serde::Serialize, serde::Deserialize)]",
        );
    }
    for msg in ["SubmitApplicationInput", "DecisionInput"] {
        config.type_attribute(format!(".jobboard.{msg}"), "#[serde(default)]");
    }
    for field in [
        "ProfileDraft.headline",
        "ProfileDraft.bio",
        "ProfileDraft.years_experience",
        "ProfileDraft.location",
        "MembershipApplicationView.reviewed_at",
        "MembershipApplicationView.profile_draft",
        "AdminApplicationView.email",
        "AdminApplicationView.profile_draft",
    ] {
        config.field_attribute(
            format!(".jobboard.{field}"),
            "#[serde(skip_serializing_if = \"Option::is_none\")]",
        );
    }
    config.compile_protos(
        &[format!("{proto_root}/jobboard/jobboard.proto")],
        &[proto_root.to_string()],
    )?;

    println!("cargo:warning=Protobuf compilation complete (jobboard)");
    Ok(())
}
