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

		// Force default symbol visibility on sqlite3 entry points so consumer
		// modules (chuck, etc) can link directly against sqlite3_open/...etc
		// from this plugin's .dylib/.so without re-bundling the amalgamation.
		PublicDefinitions.Add("SQLITE_API=__attribute__((visibility(\"default\")))");
		PublicDefinitions.Add("SQLITE_EXTERN=extern __attribute__((visibility(\"default\")))");
	}
}
