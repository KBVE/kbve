// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class rentearth : ModuleRules
{
	public rentearth(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[] {
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",
			"AIModule",
			"StateTreeModule",
			"GameplayStateTreeModule",
			"UMG",
			"Slate"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });

		PublicIncludePaths.AddRange(new string[] {
			"rentearth",
			"rentearth/Variant_Platforming",
			"rentearth/Variant_Platforming/Animation",
			"rentearth/Variant_Combat",
			"rentearth/Variant_Combat/AI",
			"rentearth/Variant_Combat/Animation",
			"rentearth/Variant_Combat/Gameplay",
			"rentearth/Variant_Combat/Interfaces",
			"rentearth/Variant_Combat/UI",
			"rentearth/Variant_SideScrolling",
			"rentearth/Variant_SideScrolling/AI",
			"rentearth/Variant_SideScrolling/Gameplay",
			"rentearth/Variant_SideScrolling/Interfaces",
			"rentearth/Variant_SideScrolling/UI"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
