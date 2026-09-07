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
			"Engine",
			"ProceduralMeshComponent",
			// For IKBVEMovementDriver alone: the streamer has to put the player
			// down at the planned start, and only the pawn's own backend knows
			// how to be told that.
			"KBVEGameplay"
		});

		// FastNoiseLite (header-only) — vendored once for the whole world plugin.
		PublicIncludePaths.Add(Path.Combine(ModuleDirectory, "ThirdParty"));
	}
}
