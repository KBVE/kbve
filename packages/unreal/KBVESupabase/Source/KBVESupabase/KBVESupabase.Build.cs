using UnrealBuildTool;

public class KBVESupabase : ModuleRules
{
	public KBVESupabase(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.NoSharedPCHs;
		bUseUnity = false;
		IWYUSupport = IWYUSupport.Full;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"HTTP",
			"HTTPServer",
			"Json",
			"JsonUtilities",
			"DeveloperSettings",
			"WebSockets"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Sockets",
			"Networking"
		});

		if (Target.Platform == UnrealTargetPlatform.Mac)
		{
			PublicFrameworks.Add("Cocoa");
		}
	}
}
