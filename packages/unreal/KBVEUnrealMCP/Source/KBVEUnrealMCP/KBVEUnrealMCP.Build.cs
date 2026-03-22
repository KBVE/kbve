using UnrealBuildTool;

public class KBVEUnrealMCP : ModuleRules
{
	public KBVEUnrealMCP(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"Json",
			"JsonUtilities"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			// Editor
			"UnrealEd",
			"EditorSubsystem",
			"ToolMenus",
			"Slate",
			"SlateCore",
			"InputCore",
			"LevelEditor",
			// TCP server
			"Networking",
			"Sockets",
			// Blueprint editing
			"BlueprintGraph",
			"Kismet",
			"KismetCompiler",
			// Asset management
			"AssetRegistry",
			"AssetTools",
			// Navigation
			"NavigationSystem",
			// Enhanced Input
			"EnhancedInput",
			// UMG
			"UMG",
			"UMGEditor",
			// Landscape
			"Landscape",
			"Foliage",
			"LandscapeEditor",
			// AI
			"AIModule",
			// Gameplay Tags
			"GameplayTags",
			// Niagara (runtime component access)
			"Niagara",
			// RHI (GPU adapter info)
			"RHI",
			// Settings
			"DeveloperSettings"
		});
	}
}
