#pragma once

#include "CoreMinimal.h"

/**
 * Describes a single plugin available in the KBVE registry.
 */
struct FKBVEPluginEntry
{
	/** Plugin name (matches folder name under packages/unreal/) */
	FString Name;

	/** Short description shown in the UI */
	FString Description;

	/** Remote version from the registry (populated after refresh) */
	FString RemoteVersion;

	/** Local version if installed (empty if not installed) */
	FString LocalVersion;

	/** Whether this plugin is currently installed in the project */
	bool bInstalled = false;

	/** Whether an update is available (remote > local) */
	bool bUpdateAvailable = false;
};

/**
 * Manages the list of known KBVE plugins from the kbve/kbve monorepo.
 * Clones the registry repo to a staging area and reads version.toml files.
 */
class KBVELIBGIT_API FKBVEPluginRegistry
{
public:
	/** GitHub HTTPS URL for the KBVE monorepo */
	static constexpr const TCHAR* RegistryRepoUrl = TEXT("https://github.com/kbve/kbve");

	/** Path within the monorepo where UE plugins live */
	static constexpr const TCHAR* PluginsSubPath = TEXT("packages/unreal");

	/** Default branch to use */
	static constexpr const TCHAR* DefaultBranch = TEXT("dev");

	/** Known plugins with descriptions (static registry) */
	static TArray<FKBVEPluginEntry> GetDefaultEntries();

	/**
	 * Read a version string from a version.toml file.
	 * Looks for: version = "x.y.z"
	 */
	static FString ReadVersionFromToml(const FString& TomlPath);

	/**
	 * Check which plugins are locally installed and read their versions.
	 * Populates bInstalled and LocalVersion on each entry.
	 */
	static void CheckLocalInstallStatus(TArray<FKBVEPluginEntry>& Entries);

	/**
	 * Given a cloned copy of the monorepo, read remote versions from version.toml.
	 * Populates RemoteVersion and bUpdateAvailable on each entry.
	 */
	static void ReadRemoteVersions(TArray<FKBVEPluginEntry>& Entries, const FString& ClonedRepoPath);
};
