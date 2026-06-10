using UnrealBuildTool;
using System.IO;

public class KBVEYYJson : ModuleRules
{
	public KBVEYYJson(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "yyjson");

		PublicIncludePaths.Add(ThirdPartyDir);

		if (Target.Platform == UnrealTargetPlatform.Win64)
		{
			PrivateDefinitions.Add("YYJSON_EXPORTS=1");
		}

		// Suppress warnings in third-party code
		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
