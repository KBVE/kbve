using UnrealBuildTool;

public class KBVEMover : ModuleRules
{
	public KBVEMover(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"EnhancedInput",
			"GameplayTags",
			"Mover",
			"KBVEGameplay",
			// The native foot-IK anim instance: AnimationCore for the two-bone
			// solve, AnimGraphRuntime for the pose and bone-reference types.
			"AnimationCore",
			"AnimGraphRuntime"
		});
	}
}
