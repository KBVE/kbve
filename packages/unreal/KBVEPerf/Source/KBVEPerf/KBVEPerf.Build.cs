using UnrealBuildTool;

public class KBVEPerf : ModuleRules
{
	public KBVEPerf(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"HTTPServer",
			"Json",
			"RHI",
			"RenderCore"
		});

		bool bPerfEnabled = Target.Configuration != UnrealTargetConfiguration.Shipping;
		PublicDefinitions.Add("KBVEPERF_ENABLED=" + (bPerfEnabled ? "1" : "0"));
	}
}
