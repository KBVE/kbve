using UnrealBuildTool;

public class KBVECombat : ModuleRules
{
	public KBVECombat(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"NetCore",
			"MassCore",
			"MassEntity",
			"MassCommon",
			"KBVEGameplay"
		});
	}
}
