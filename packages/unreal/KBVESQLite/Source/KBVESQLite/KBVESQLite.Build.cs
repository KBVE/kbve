using UnrealBuildTool;
using System.IO;

public class KBVESQLite : ModuleRules
{
	public KBVESQLite(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "sqlite");
		PublicIncludePaths.Add(ThirdPartyDir);

		// Suppress warnings in third-party code
		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;

		if (Target.Platform == UnrealTargetPlatform.Win64)
		{
			PrivateDefinitions.Add("SQLITE_API=__declspec(dllexport)");
		}
		else
		{
			PublicDefinitions.Add("SQLITE_API=__attribute__((visibility(\"default\")))");
			PublicDefinitions.Add("SQLITE_EXTERN=extern __attribute__((visibility(\"default\")))");
		}
	}
}
