using UnrealBuildTool;

public class KBVEProfessionDB : ModuleRules
{
	public KBVEProfessionDB(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVEYYJson"
		});
	}
}
