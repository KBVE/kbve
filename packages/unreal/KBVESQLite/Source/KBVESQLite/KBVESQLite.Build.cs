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

		// Enable the column-metadata APIs (sqlite3_column_{database,table,origin}_name).
		// Without this, the amalgamation's #ifndef SQLITE_ENABLE_COLUMN_METADATA branch
		// redefines those 6 names as `0` macros, clashing with the kbve_ renames already
		// established by sqlite3_prefix.h. MSVC tolerates the macro redefinition, but Mac
		// clang compiles third-party code with -Werror,-Wmacro-redefined and fails the
		// build. Enabling the feature skips that branch entirely (no redefinition on any
		// platform) and makes the prefixed symbols — which the prefix header already
		// enumerates — real exported functions.
		PrivateDefinitions.Add("SQLITE_ENABLE_COLUMN_METADATA=1");

		// Export the sqlite3 entry points from THIS module so consumer modules
		// (e.g. KBVEWorld) can link directly against sqlite3_open/...etc without
		// re-bundling the amalgamation.
		//
		// These defines must apply only when compiling the amalgamation itself
		// (PrivateDefinitions), not to consumers. sqlite3.c/.h are plain C and
		// never include UE's platform headers, so we expand to the raw compiler
		// construct rather than UE's DLLEXPORT/KBVESQLITE_API macros (which would
		// leave bare tokens). Consumers get no SQLITE_API define and fall back to
		// sqlite3.h's built-in empty default — plain extern function decls link
		// fine against this module's import library (consumers call sqlite
		// functions only, no exported data globals).
		if (Target.Platform == UnrealTargetPlatform.Win64)
		{
			PrivateDefinitions.Add("SQLITE_API=__declspec(dllexport)");
		}
		else
		{
			PrivateDefinitions.Add("SQLITE_API=__attribute__((visibility(\"default\")))");
		}
	}
}
