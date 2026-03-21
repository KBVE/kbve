using UnrealBuildTool;
using System.IO;

public class KBVETinyBVH : ModuleRules
{
	public KBVETinyBVH(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "tinybvh");

		PublicIncludePaths.Add(ThirdPartyDir);

		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
