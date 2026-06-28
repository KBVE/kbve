using UnrealBuildTool;
using System.IO;

public class KBVEHexWorld : ModuleRules
{
	public KBVEHexWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"Projects",
			"ProceduralMeshComponent"
		});

		// FastNoiseLite (header-only)
		PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "ThirdParty"));
	}
}
