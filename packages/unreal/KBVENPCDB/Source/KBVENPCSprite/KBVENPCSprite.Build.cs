using UnrealBuildTool;

public class KBVENPCSprite : ModuleRules
{
	public KBVENPCSprite(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVENPCDB"
		});
	}
}
