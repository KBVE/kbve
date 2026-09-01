using UnrealBuildTool;

public class RareIcon : ModuleRules
{
	public RareIcon(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput"
		});

		PrivateDependencyModuleNames.AddRange(new string[] {
			"Json",
			"JsonUtilities",
			"KBVEUnr",
			"KBVEWorldCore"
		});

		PublicIncludePaths.AddRange(new string[] {
			"RareIcon"
		});
	}
}
