using UnrealBuildTool;

public class KBVEUIChat : ModuleRules
{
	public KBVEUIChat(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.NoSharedPCHs;
		bUseUnity = false;
		IWYUSupport = IWYUSupport.Full;

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

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
