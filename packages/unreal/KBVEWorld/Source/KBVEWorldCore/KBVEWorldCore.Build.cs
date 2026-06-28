using UnrealBuildTool;
using System.IO;

public class KBVEWorldCore : ModuleRules
{
	public KBVEWorldCore(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine"
		});

		// FastNoiseLite (header-only) — vendored once for the whole world plugin.
		PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "ThirdParty"));
	}
}
