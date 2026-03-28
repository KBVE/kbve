using UnrealBuildTool;
using System.IO;

public class KBVELibGit : ModuleRules
{
	public KBVELibGit(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"Slate",
			"SlateCore",
			"UnrealEd",
			"HTTP",
			"Json",
			"JsonUtilities",
			"Projects",
			"ToolMenus",
			"InputCore"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "libgit2");
		string IncludeDir = Path.Combine(ThirdPartyDir, "include");

		PublicIncludePaths.Add(IncludeDir);

		// Platform-specific static library linkage
		string LibDir;
		if (Target.Platform == UnrealTargetPlatform.Win64)
		{
			LibDir = Path.Combine(ThirdPartyDir, "lib", "Win64");
			PublicAdditionalLibraries.Add(Path.Combine(LibDir, "git2.lib"));
		}
		else if (Target.Platform == UnrealTargetPlatform.Mac)
		{
			LibDir = Path.Combine(ThirdPartyDir, "lib", "Mac");
			PublicAdditionalLibraries.Add(Path.Combine(LibDir, "libgit2.a"));
			// libgit2 uses iconv for Unicode path normalization on macOS
			PublicAdditionalLibraries.Add("iconv");
		}
		else if (Target.Platform == UnrealTargetPlatform.Linux)
		{
			LibDir = Path.Combine(ThirdPartyDir, "lib", "Linux");
			PublicAdditionalLibraries.Add(Path.Combine(LibDir, "libgit2.a"));
		}

		// Suppress warnings in third-party code
		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
