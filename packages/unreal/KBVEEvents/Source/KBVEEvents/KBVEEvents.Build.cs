using UnrealBuildTool;

public class KBVEEvents : ModuleRules
{
	public KBVEEvents(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
