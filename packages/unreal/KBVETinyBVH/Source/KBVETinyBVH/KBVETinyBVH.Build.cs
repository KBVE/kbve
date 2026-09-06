using UnrealBuildTool;
using System.IO;

public class KBVETinyBVH : ModuleRules
{
	public KBVETinyBVH(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// TINYBVH_IMPLEMENTATION has to land in exactly one translation unit, and a
		// unity blob would happily put the file that defines it after a file that has
		// already pulled the header in -- at which point the include guard swallows
		// the implementation and the module fails to link.
		bUseUnity = false;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "tinybvh");

		PublicIncludePaths.Add(ThirdPartyDir);

		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
