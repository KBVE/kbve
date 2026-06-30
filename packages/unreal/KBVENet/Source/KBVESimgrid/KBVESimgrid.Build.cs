using UnrealBuildTool;

public class KBVESimgrid : ModuleRules
{
	public KBVESimgrid(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"WebSockets",
			"KBVESupabase"
		});
	}
}
