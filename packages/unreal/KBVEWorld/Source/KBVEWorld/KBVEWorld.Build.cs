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
			"PhysicsCore",
			"MassEntity",
			"MassCommon",
			"StructUtils"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"RHI",
			"RenderCore",
			"Renderer",
			"Projects",
			"KBVESQLite",
			"KBVEPerf"
		});

		if (Target.bBuildEditor)
		{
			PrivateDependencyModuleNames.AddRange(new string[]
			{
				"UnrealEd",
				"MaterialEditor",
				"AssetRegistry"
			});
		}
	}
}
