using UnrealBuildTool;

public class ROWSupabase : ModuleRules
{
	public ROWSupabase(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.NoSharedPCHs;
		bUseUnity = false;
		IWYUSupport = IWYUSupport.Full;

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
