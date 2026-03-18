using UnrealBuildTool;

public class UEDevOpsEditor : ModuleRules
{
	public UEDevOpsEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"UEDevOps"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"UnrealEd",
			"ToolMenus",
			"HTTP",
			"Json",
			"JsonUtilities",
			"EditorStyle",
			"InputCore"
		});
	}
}
