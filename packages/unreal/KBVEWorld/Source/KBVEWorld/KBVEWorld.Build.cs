using UnrealBuildTool;

public class KBVEWorld : ModuleRules
{
	public KBVEWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"ProceduralMeshComponent",
			"NavigationSystem",
			"Foliage",
			"MeshDescription",
			"StaticMeshDescription",
			"PhysicsCore"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"RHI",
			"RenderCore",
			"Renderer",
			"Projects",
			"KBVESQLite"
		});

		if (Target.bBuildEditor)
		{
			PrivateDependencyModuleNames.AddRange(new string[]
			{
				"UnrealEd",
				"MaterialEditor"
			});
		}

		PublicIncludePaths.AddRange(new string[]
		{
			"KBVEWorld/Public"
		});

		PrivateIncludePaths.AddRange(new string[]
		{
			"KBVEWorld/Private"
		});
	}
}
