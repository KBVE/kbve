using UnrealBuildTool;

public class KBVEGameplay : ModuleRules
{
	public KBVEGameplay(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"MassCore",
			"MassEntity",
			"GameplayTags"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
