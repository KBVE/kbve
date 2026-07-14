#include "KBVEPluginRegistry.h"
#include "KBVEPluginLock.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"

TArray<FKBVEPluginEntry> FKBVEPluginRegistry::GetDefaultEntries()
{
	TArray<FKBVEPluginEntry> Entries;

	auto Add = [&](const FString& Name, const FString& Desc)
	{
		FKBVEPluginEntry E;
		E.Name = Name;
		E.Description = Desc;
		Entries.Add(MoveTemp(E));
	};

	Add(TEXT("KBVELibGit"),     TEXT("Git-based plugin manager (libgit2) — this plugin"));
	Add(TEXT("KBVEEvents"),     TEXT("Lightweight pub/sub event channels for UI + sim"));
	Add(TEXT("KBVEUI"),         TEXT("Slate widget library — tooltip, toast, hotbar, settings, drag layer"));
	Add(TEXT("KBVEGameplay"),   TEXT("Gameplay effect framework — consumables, buffs, status"));
	Add(TEXT("KBVEItemDB"),     TEXT("Item database + inventory model + dropped-item Mass fragment"));
	Add(TEXT("KBVENPCDB"),      TEXT("NPC database loader + Mass Entity spawner subsystem"));
	Add(TEXT("KBVEMapDB"),      TEXT("World/map database loader"));
	Add(TEXT("KBVEQuestDB"),    TEXT("Quest database loader"));
	Add(TEXT("KBVEWorld"),      TEXT("Procedural terrain + foliage + chunk streaming toolkit"));
	Add(TEXT("KBVEHexWorld"),   TEXT("Hex grid world utilities"));
	Add(TEXT("KBVEROWS"),       TEXT("Open World Server (ROWS) auth + character + instance client"));
	Add(TEXT("KBVESupabase"),   TEXT("Supabase auth, JWT, storage, chat WebSocket bridge"));
	Add(TEXT("KBVEULID"),       TEXT("ULID generation"));
	Add(TEXT("KBVESQLite"),     TEXT("SQLite database integration"));
	Add(TEXT("KBVETinyBVH"),    TEXT("Bounding Volume Hierarchy acceleration"));
	Add(TEXT("KBVEXXHash"),     TEXT("XXHash fast hashing"));
	Add(TEXT("KBVEYYJson"),     TEXT("YYJson high-performance JSON parser"));
	Add(TEXT("KBVEZstd"),       TEXT("Zstandard compression"));
	Add(TEXT("KBVEWASM"),       TEXT("WebAssembly runtime"));
	Add(TEXT("KBVEWebSurface"), TEXT("Embedded web surface widget"));
	Add(TEXT("KBVEUnrealMCP"),  TEXT("Model Context Protocol for Unreal"));
	Add(TEXT("UEDevOps"),       TEXT("DevOps utilities for Unreal Engine"));

	return Entries;
}

FString FKBVEPluginRegistry::ReadVersionFromToml(const FString& TomlPath)
{
	FString Content;
	if (!FFileHelper::LoadFileToString(Content, *TomlPath))
	{
		return FString();
	}

	// Parse: version = "x.y.z"
	int32 Idx = Content.Find(TEXT("version"));
	if (Idx == INDEX_NONE)
	{
		return FString();
	}

	int32 QuoteStart = Content.Find(TEXT("\""), ESearchCase::CaseSensitive, ESearchDir::FromStart, Idx);
	if (QuoteStart == INDEX_NONE)
	{
		return FString();
	}
	QuoteStart++; // skip opening quote

	int32 QuoteEnd = Content.Find(TEXT("\""), ESearchCase::CaseSensitive, ESearchDir::FromStart, QuoteStart);
	if (QuoteEnd == INDEX_NONE)
	{
		return FString();
	}

	return Content.Mid(QuoteStart, QuoteEnd - QuoteStart);
}

void FKBVEPluginRegistry::CheckLocalInstallStatus(TArray<FKBVEPluginEntry>& Entries)
{
	FString PluginsDir = FPaths::Combine(FPaths::ProjectDir(), TEXT("Plugins"));

	for (FKBVEPluginEntry& Entry : Entries)
	{
		FString PluginDir = FPaths::Combine(PluginsDir, Entry.Name);
		FString VersionToml = FPaths::Combine(PluginDir, TEXT("version.toml"));

		if (IFileManager::Get().DirectoryExists(*PluginDir))
		{
			Entry.bInstalled = true;
			Entry.LocalVersion = ReadVersionFromToml(VersionToml);

			if (Entry.LocalVersion.IsEmpty())
			{
				Entry.LocalVersion = TEXT("?.?.?");
			}
		}
		else
		{
			Entry.bInstalled = false;
			Entry.LocalVersion.Empty();
		}
	}
}

void FKBVEPluginRegistry::ReadRemoteVersions(TArray<FKBVEPluginEntry>& Entries, const FString& ClonedRepoPath)
{
	for (FKBVEPluginEntry& Entry : Entries)
	{
		FString RemoteToml = FPaths::Combine(ClonedRepoPath, PluginsSubPath, Entry.Name, TEXT("version.toml"));
		Entry.RemoteVersion = ReadVersionFromToml(RemoteToml);

		if (!Entry.RemoteVersion.IsEmpty() && Entry.bInstalled && !Entry.LocalVersion.IsEmpty())
		{
			Entry.bUpdateAvailable = (Entry.RemoteVersion != Entry.LocalVersion);
		}
		else
		{
			Entry.bUpdateAvailable = false;
		}
	}
}

void FKBVEPluginRegistry::ApplyLockStatus(TArray<FKBVEPluginEntry>& Entries, const FKBVEPluginLockFile& Lock)
{
	for (FKBVEPluginEntry& Entry : Entries)
	{
		const FKBVEPluginLockEntry* Pin = FKBVEPluginLock::FindEntry(Lock, Entry.Name);
		if (Pin)
		{
			Entry.bInLock = true;
			Entry.LockedVersion = Pin->Version;
			Entry.bMatchesLock = Entry.bInstalled && Entry.LocalVersion == Pin->Version;
		}
		else
		{
			Entry.bInLock = false;
			Entry.LockedVersion.Empty();
			Entry.bMatchesLock = false;
		}
	}
}

TArray<FString> FKBVEPluginRegistry::GetLockDrift()
{
	TArray<FString> Drift;

	FKBVEPluginLockFile Lock;
	if (!FKBVEPluginLock::Load(Lock) || Lock.Plugins.Num() == 0)
	{
		return Drift;
	}

	TArray<FKBVEPluginEntry> Entries = GetDefaultEntries();
	CheckLocalInstallStatus(Entries);
	ApplyLockStatus(Entries, Lock);

	for (const FKBVEPluginEntry& Entry : Entries)
	{
		if (!Entry.bInLock)
		{
			continue;
		}

		if (!Entry.bInstalled)
		{
			Drift.Add(FString::Printf(TEXT("%s: locked v%s but not installed"), *Entry.Name, *Entry.LockedVersion));
		}
		else if (!Entry.bMatchesLock)
		{
			Drift.Add(FString::Printf(TEXT("%s: installed v%s != locked v%s"), *Entry.Name, *Entry.LocalVersion, *Entry.LockedVersion));
		}
	}

	return Drift;
}
