using UnrealBuildTool;
using System.IO;

public class KBVEZstd : ModuleRules
{
	public KBVEZstd(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "zstd");

		PublicIncludePaths.Add(ThirdPartyDir);
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "common"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "compress"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "decompress"));

		// Suppress warnings in third-party code
		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
