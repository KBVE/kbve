using UnrealBuildTool;

public class KBVEMoverEditor : ModuleRules
{
	public KBVEMoverEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
		});

		// UnrealEd carries the physics asset factory, which is the whole reason
		// this module exists: the engine can build collision bodies from a mesh
		// and the entry point is editor-only C++ with no script exposure.
		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"UnrealEd",
			"AssetTools",
			"PhysicsUtilities",
			"PhysicsCore",
			"KBVEMover",
		});
	}
}
