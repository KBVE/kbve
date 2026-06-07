#pragma once

#include "CoreMinimal.h"

struct FKBVEPluginLockEntry
{
	FString Name;
	FString Version;
	FString Resolution = TEXT("source"); // "source" | "asset"
	FString Ref;
	FString Integrity;
};

struct FKBVEPluginLockFile
{
	FString Engine;
	FString Registry;
	TArray<FKBVEPluginLockEntry> Plugins;
};

class KBVELIBGIT_API FKBVEPluginLock
{
public:
	static constexpr const TCHAR* LockFileName = TEXT("unreal-plugins.lock.json");
	static constexpr const TCHAR* ResolutionSource = TEXT("source");
	static constexpr const TCHAR* ResolutionAsset  = TEXT("asset");

	static FString GetLockFilePath();
	static bool Exists();
	static bool Load(FKBVEPluginLockFile& OutLock);
	static bool Save(const FKBVEPluginLockFile& Lock);

	static const FKBVEPluginLockEntry* FindEntry(const FKBVEPluginLockFile& Lock, const FString& Name);
	static FKBVEPluginLockEntry& UpsertEntry(FKBVEPluginLockFile& Lock, const FKBVEPluginLockEntry& Entry);
};
