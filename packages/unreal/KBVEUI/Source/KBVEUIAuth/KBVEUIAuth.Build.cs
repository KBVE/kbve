using UnrealBuildTool;

public class KBVEUIAuth : ModuleRules
{
	public KBVEUIAuth(ReadOnlyTargetRules Target) : base(Target)
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

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"HTTP"
		});
	}
}
