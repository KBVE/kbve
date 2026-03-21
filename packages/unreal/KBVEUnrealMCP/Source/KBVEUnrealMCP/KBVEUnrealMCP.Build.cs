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
			// WebSocket server
			"WebSockets",
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
			// Settings
			"DeveloperSettings"
		});
	}
}
