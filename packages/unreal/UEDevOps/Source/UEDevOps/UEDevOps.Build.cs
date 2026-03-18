using UnrealBuildTool;
using System.IO;

public class UEDevOps : ModuleRules
{
	public UEDevOps(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"HTTP",
			"Json",
			"JsonUtilities",
			"DeveloperSettings"
		});

		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore"
		});

		// ─── Third-party libraries ───────────────────────────────────────
		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty");

		// yyjson 0.12.0 (MIT) — fast JSON serialization
		PrivateIncludePaths.Add(Path.Combine(ThirdPartyDir, "yyjson"));

		// xxHash 0.8.3 (BSD-2) — header-only hashing for event dedup
		PrivateIncludePaths.Add(Path.Combine(ThirdPartyDir, "xxHash"));
		PrivateDefinitions.Add("XXH_INLINE_ALL");

		// zstd 1.5.7 (BSD) — payload compression
		PrivateIncludePaths.Add(Path.Combine(ThirdPartyDir, "zstd"));
		PrivateIncludePaths.Add(Path.Combine(ThirdPartyDir, "zstd", "common"));
		PrivateIncludePaths.Add(Path.Combine(ThirdPartyDir, "zstd", "compress"));
		PrivateIncludePaths.Add(Path.Combine(ThirdPartyDir, "zstd", "decompress"));

		// Suppress warnings in third-party code
		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
