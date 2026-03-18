using UnrealBuildTool;
using System.IO;

public class KBVEXXHash : ModuleRules
{
	public KBVEXXHash(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "xxHash");

		PublicIncludePaths.Add(ThirdPartyDir);
		PublicDefinitions.Add("XXH_INLINE_ALL");
	}
}
