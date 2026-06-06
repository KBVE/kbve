using UnrealBuildTool;

public class ROWS : ModuleRules
{
	public ROWS(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"HTTP",
			"Json",
			"JsonUtilities",
			"Slate",
			"SlateCore",
			"UMG"
		});
	}
}
