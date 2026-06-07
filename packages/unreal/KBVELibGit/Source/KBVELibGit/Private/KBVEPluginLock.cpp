#include "KBVEPluginLock.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"

FString FKBVEPluginLock::GetLockFilePath()
{
	return FPaths::Combine(FPaths::ProjectDir(), LockFileName);
}

bool FKBVEPluginLock::Exists()
{
	return FPaths::FileExists(GetLockFilePath());
}

bool FKBVEPluginLock::Load(FKBVEPluginLockFile& OutLock)
{
	OutLock = FKBVEPluginLockFile();

	FString Content;
	if (!FFileHelper::LoadFileToString(Content, *GetLockFilePath()))
	{
		return false;
	}

	TSharedPtr<FJsonObject> Root;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Content);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVELibGit] Lockfile is not valid JSON: %s"), *GetLockFilePath());
		return false;
	}

	Root->TryGetStringField(TEXT("engine"), OutLock.Engine);
	Root->TryGetStringField(TEXT("registry"), OutLock.Registry);

	const TArray<TSharedPtr<FJsonValue>>* Plugins = nullptr;
	if (Root->TryGetArrayField(TEXT("plugins"), Plugins))
	{
		for (const TSharedPtr<FJsonValue>& Value : *Plugins)
		{
			const TSharedPtr<FJsonObject>* Obj = nullptr;
			if (!Value->TryGetObject(Obj) || !Obj->IsValid())
			{
				continue;
			}

			FKBVEPluginLockEntry Entry;
			(*Obj)->TryGetStringField(TEXT("name"), Entry.Name);
			(*Obj)->TryGetStringField(TEXT("version"), Entry.Version);
			(*Obj)->TryGetStringField(TEXT("resolution"), Entry.Resolution);
			(*Obj)->TryGetStringField(TEXT("ref"), Entry.Ref);
			(*Obj)->TryGetStringField(TEXT("integrity"), Entry.Integrity);

			if (!Entry.Name.IsEmpty())
			{
				OutLock.Plugins.Add(MoveTemp(Entry));
			}
		}
	}

	return true;
}

bool FKBVEPluginLock::Save(const FKBVEPluginLockFile& Lock)
{
	TSharedRef<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("engine"), Lock.Engine);
	Root->SetStringField(TEXT("registry"), Lock.Registry);

	TArray<TSharedPtr<FJsonValue>> Plugins;
	for (const FKBVEPluginLockEntry& Entry : Lock.Plugins)
	{
		TSharedRef<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("name"), Entry.Name);
		Obj->SetStringField(TEXT("version"), Entry.Version);
		Obj->SetStringField(TEXT("resolution"), Entry.Resolution);
		Obj->SetStringField(TEXT("ref"), Entry.Ref);
		Obj->SetStringField(TEXT("integrity"), Entry.Integrity);
		Plugins.Add(MakeShared<FJsonValueObject>(Obj));
	}
	Root->SetArrayField(TEXT("plugins"), Plugins);

	FString Output;
	TSharedRef<TJsonWriter<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>> Writer =
		TJsonWriterFactory<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>::Create(&Output);

	if (!FJsonSerializer::Serialize(Root, Writer))
	{
		return false;
	}

	if (!FFileHelper::SaveStringToFile(Output, *GetLockFilePath()))
	{
		UE_LOG(LogTemp, Error, TEXT("[KBVELibGit] Failed to write lockfile: %s"), *GetLockFilePath());
		return false;
	}

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Wrote lockfile: %s (%d plugin(s))"), *GetLockFilePath(), Lock.Plugins.Num());
	return true;
}

const FKBVEPluginLockEntry* FKBVEPluginLock::FindEntry(const FKBVEPluginLockFile& Lock, const FString& Name)
{
	for (const FKBVEPluginLockEntry& Entry : Lock.Plugins)
	{
		if (Entry.Name.Equals(Name, ESearchCase::IgnoreCase))
		{
			return &Entry;
		}
	}
	return nullptr;
}

FKBVEPluginLockEntry& FKBVEPluginLock::UpsertEntry(FKBVEPluginLockFile& Lock, const FKBVEPluginLockEntry& Entry)
{
	for (FKBVEPluginLockEntry& Existing : Lock.Plugins)
	{
		if (Existing.Name.Equals(Entry.Name, ESearchCase::IgnoreCase))
		{
			Existing = Entry;
			return Existing;
		}
	}
	return Lock.Plugins.Add_GetRef(Entry);
}
