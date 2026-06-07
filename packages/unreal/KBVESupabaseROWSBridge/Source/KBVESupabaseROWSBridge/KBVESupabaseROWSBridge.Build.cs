using UnrealBuildTool;

public class KBVESupabaseROWSBridge : ModuleRules
{
	public KBVESupabaseROWSBridge(ReadOnlyTargetRules Target) : base(Target)
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
