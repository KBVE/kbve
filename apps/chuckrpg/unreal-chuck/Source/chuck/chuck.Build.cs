// Copyright Epic Games, Inc. All Rights Reserved.

using UnrealBuildTool;

public class chuck : ModuleRules
{
	public chuck(ReadOnlyTargetRules Target) : base(Target)
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
			"Slate",
			"SlateCore",
			"MassEntity",
			"MassCommon",
			"StructUtils",
			"NetCore"
		});

		PrivateDependencyModuleNames.AddRange(new string[] {
			"Json",
			"JsonUtilities",
			"ImageWrapper",
			"AsyncMessageSystem",
			"KBVEYYJson",
			"KBVEXXHash",
			"KBVEULID",
			"KBVEUI",
			"KBVEEvents",
			"KBVESupabase"
		});


		PublicIncludePaths.AddRange(new string[] {
			"chuck",
			"chuck/Core",
			"chuck/Events",
			"chuck/Item",
			"chuck/Mass",
			"chuck/UI",
			"chuck/UI/HUD",
			"chuck/UI/Inventory",
			"chuck/UI/Auth",
			"chuck/UI/Chat",
			"chuck/Variant_Platforming",
			"chuck/Variant_Platforming/Animation",
			"chuck/Variant_Combat",
			"chuck/Variant_Combat/AI",
			"chuck/Variant_Combat/Animation",
			"chuck/Variant_Combat/Gameplay",
			"chuck/Variant_Combat/Interfaces",
			"chuck/Variant_Combat/UI",
			"chuck/Variant_SideScrolling",
			"chuck/Variant_SideScrolling/AI",
			"chuck/Variant_SideScrolling/Gameplay",
			"chuck/Variant_SideScrolling/Interfaces",
			"chuck/Variant_SideScrolling/UI"
		});

		// Uncomment if you are using Slate UI
		// PrivateDependencyModuleNames.AddRange(new string[] { "Slate", "SlateCore" });

		// Uncomment if you are using online features
		// PrivateDependencyModuleNames.Add("OnlineSubsystem");

		// To include OnlineSubsystemSteam, add it to the plugins section in your uproject file with the Enabled attribute set to true
	}
}
