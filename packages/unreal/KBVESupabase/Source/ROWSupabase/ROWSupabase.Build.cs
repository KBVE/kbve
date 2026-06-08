using UnrealBuildTool;

public class ROWSupabase : ModuleRules
{
	public ROWSupabase(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVESupabase",
			"ROWS"
		});
	}
}
