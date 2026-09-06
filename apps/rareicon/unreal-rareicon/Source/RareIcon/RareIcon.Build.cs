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
			"KBVETinyBVH",
			"KBVEMover",
			// The loading screen: the shared Slate library it is built from, and
			// the two engine modules any widget needs.
			"KBVEUI",
			"Slate",
			"SlateCore",
			// Reading the pawn's movement mode needs the concrete component, not
			// the forward declaration KBVEMoverPawn.h gets away with.
			"Mover"
		});

		PublicIncludePaths.AddRange(new string[] {
			"RareIcon",
			"RareIcon/Player",
			"RareIcon/World"
		});
	}
}
