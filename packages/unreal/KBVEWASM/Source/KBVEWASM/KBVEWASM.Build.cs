using UnrealBuildTool;
using System.IO;

public class KBVEWASM : ModuleRules
{
	public KBVEWASM(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core"
		});

		string ThirdPartyDir = Path.Combine(ModuleDirectory, "..", "..", "ThirdParty", "wamr");

		// WAMR public API headers
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "include"));

		// Internal headers required by the compilation units
		PublicIncludePaths.Add(ThirdPartyDir);
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "common"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "interpreter"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "utils"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "mem-alloc"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "mem-alloc", "ems"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "include"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "libraries", "libc-builtin"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "common", "arch"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "common", "posix"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "common", "libc-util"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "common", "math"));
		PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "common", "memory"));

		// Platform-specific include for platform_internal.h
		if (Target.Platform == UnrealTargetPlatform.Win64)
		{
			PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "windows"));
		}
		else if (Target.Platform == UnrealTargetPlatform.Mac)
		{
			PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "darwin"));
		}
		else if (Target.Platform == UnrealTargetPlatform.Linux ||
		         Target.Platform == UnrealTargetPlatform.LinuxArm64)
		{
			PublicIncludePaths.Add(Path.Combine(ThirdPartyDir, "shared", "platform", "linux"));
		}

		// WAMR feature defines: interpreter-only, classic mode, no AOT/JIT
		PublicDefinitions.Add("WASM_ENABLE_INTERP=1");
		PublicDefinitions.Add("WASM_ENABLE_FAST_INTERP=0");
		PublicDefinitions.Add("WASM_ENABLE_AOT=0");
		PublicDefinitions.Add("WASM_ENABLE_JIT=0");
		PublicDefinitions.Add("WASM_ENABLE_FAST_JIT=0");
		PublicDefinitions.Add("WASM_ENABLE_LIBC_BUILTIN=1");
		PublicDefinitions.Add("WASM_ENABLE_LIBC_WASI=0");
		PublicDefinitions.Add("WASM_ENABLE_BULK_MEMORY=1");
		PublicDefinitions.Add("WASM_ENABLE_REF_TYPES=1");
		PublicDefinitions.Add("WASM_ENABLE_MULTI_MODULE=0");
		PublicDefinitions.Add("WASM_ENABLE_MINI_LOADER=0");
		PublicDefinitions.Add("WASM_ENABLE_SHARED_MEMORY=0");
		PublicDefinitions.Add("WASM_ENABLE_THREAD_MGR=0");
		PublicDefinitions.Add("WASM_ENABLE_TAIL_CALL=0");
		PublicDefinitions.Add("WASM_ENABLE_SIMD=0");
		PublicDefinitions.Add("WASM_ENABLE_GC=0");
		PublicDefinitions.Add("WASM_ENABLE_DEBUG_INTERP=0");
		PublicDefinitions.Add("WASM_ENABLE_MEMORY64=0");
		PublicDefinitions.Add("WASM_ENABLE_MULTI_MEMORY=0");
		PublicDefinitions.Add("WASM_ENABLE_WASM_CACHE=0");
		PublicDefinitions.Add("WASM_ENABLE_EXCE_HANDLING=0");
		PublicDefinitions.Add("WASM_ENABLE_TAGS=0");

		// Memory allocator defines
		PublicDefinitions.Add("BH_MALLOC=wasm_runtime_malloc");
		PublicDefinitions.Add("BH_FREE=wasm_runtime_free");

		// Suppress warnings in third-party code
		CppCompileWarningSettings.UndefinedIdentifierWarningLevel = WarningLevel.Off;
	}
}
