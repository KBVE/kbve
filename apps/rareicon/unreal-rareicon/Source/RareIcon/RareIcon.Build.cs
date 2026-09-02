using UnrealBuildTool;

public class RareIcon : ModuleRules
{
	public RareIcon(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput"
		});

		PrivateDependencyModuleNames.AddRange(new string[] {
			"Json",
			"JsonUtilities",
			"KBVEUnr",
			"KBVEWorldCore",
			"KBVEMover",
			// Reading the pawn's movement mode needs the concrete component, not
			// the forward declaration KBVEMoverPawn.h gets away with.
			"Mover"
		});

		PublicIncludePaths.AddRange(new string[] {
			"RareIcon",
			"RareIcon/Player"
		});
	}
}
