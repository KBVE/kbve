using UnrealBuildTool;
using System.IO;

public class KBVERareIconCore : ModuleRules
{
	public KBVERareIconCore(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "unr");
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "include"));

		string LibName = Target.Platform == UnrealTargetPlatform.Win64 ? "unr.lib" : "libunr.a";
		string LibPath = Path.Combine(ThirdPartyDir, "lib", Target.Platform.ToString(), LibName);

		// The staticlib is gitignored -- it is built from crates/unr rather than
		// vendored -- so a fresh clone hits this before it hits a link error
		// listing every unresolved unr_* symbol.
		if (!File.Exists(LibPath))
		{
			throw new BuildException(
				"KBVERareIconCore: missing " + LibPath +
				"\nBuild it first: moon run KBVERareIconCore:sync-unr");
		}

		PublicAdditionalLibraries.Add(LibPath);

		if (Target.Platform == UnrealTargetPlatform.Mac)
		{
			// Rust's std pulls these in on macOS.
			PublicFrameworks.AddRange(new string[] { "CoreFoundation", "Security" });
		}
	}
}
