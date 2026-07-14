using UnrealBuildTool;

public class KBVEItemDB : ModuleRules
{
	public KBVEItemDB(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"MassCore",
			"MassEntity",
			"KBVEYYJson"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Json",
			"JsonUtilities",
			"KBVESQLite"
		});
	}
}
