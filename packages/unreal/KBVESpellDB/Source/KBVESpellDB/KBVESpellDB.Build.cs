using UnrealBuildTool;

public class KBVESpellDB : ModuleRules
{
	public KBVESpellDB(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVEYYJson"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Json",
			"JsonUtilities"
		});
	}
}
