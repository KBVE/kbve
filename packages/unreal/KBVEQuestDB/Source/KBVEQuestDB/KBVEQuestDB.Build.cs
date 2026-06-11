using UnrealBuildTool;

public class KBVEQuestDB : ModuleRules
{
	public KBVEQuestDB(ReadOnlyTargetRules Target) : base(Target)
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
