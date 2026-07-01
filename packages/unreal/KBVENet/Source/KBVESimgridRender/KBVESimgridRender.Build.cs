using UnrealBuildTool;
using System.IO;

public class KBVESimgridRender : ModuleRules
{
	public KBVESimgridRender(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"KBVESimgrid"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"KBVEWorldCore",
			"KBVEWorld",
			"KBVEGameplay"
		});

		PrivateIncludePaths.Add(Path.Combine(ModuleDirectory, "..", "..", "..", "KBVEWorld", "Source", "KBVEWorldCore", "Public"));
	}
}
