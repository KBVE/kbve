using UnrealBuildTool;

public class KBVEUIAuth : ModuleRules
{
	public KBVEUIAuth(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"Slate",
			"SlateCore",
			"KBVEUI",
			"KBVESupabase"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"HTTP"
		});
	}
}
