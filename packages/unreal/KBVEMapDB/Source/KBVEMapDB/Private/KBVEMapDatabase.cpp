#include "KBVEMapDatabase.h"

#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

void UKBVEMapDatabase::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const FString DefaultPath = FPaths::ProjectContentDir() / TEXT("Data/mapdb-data.json");
	if (FPaths::FileExists(DefaultPath))
	{
		LoadFromFile(DefaultPath);
	}
	else
	{
		UE_LOG(LogTemp, Log, TEXT("[KBVEMapDB] mapdb-data.json not found at %s — call LoadFromFile explicitly."), *DefaultPath);
	}
}

void UKBVEMapDatabase::Deinitialize()
{
	ObjectDefs.Reset();
	RefToIndex.Reset();
	Super::Deinitialize();
}

bool UKBVEMapDatabase::LoadFromFile(const FString& FilePath)
{
	FString JsonText;
	if (!FFileHelper::LoadFileToString(JsonText, *FilePath))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEMapDB] failed to read %s"), *FilePath);
		return false;
	}
	return LoadFromJson(JsonText);
}

bool UKBVEMapDatabase::LoadFromJson(const FString& JsonText)
{
	TSharedPtr<FJsonObject> Root;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonText);
	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEMapDB] mapdb JSON parse failed"));
		return false;
	}

	const TArray<TSharedPtr<FJsonValue>>* ObjArray = nullptr;
	if (!Root->TryGetArrayField(TEXT("objectDefs"), ObjArray) || ObjArray == nullptr)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEMapDB] mapdb JSON has no 'objectDefs' array"));
		return false;
	}

	ObjectDefs.Reset();
	RefToIndex.Reset();
	ObjectDefs.Reserve(ObjArray->Num());

	auto GetFloat = [](const TSharedPtr<FJsonObject>& O, const TCHAR* Field, float& Out)
	{
		double D = 0.0;
		if (O->TryGetNumberField(Field, D)) Out = static_cast<float>(D);
	};

	for (const TSharedPtr<FJsonValue>& Value : *ObjArray)
	{
		const TSharedPtr<FJsonObject>* ObjPtr = nullptr;
		if (!Value.IsValid() || !Value->TryGetObject(ObjPtr) || ObjPtr == nullptr)
		{
			continue;
		}
		const TSharedPtr<FJsonObject>& Obj = *ObjPtr;

		FKBVEWorldObjectDef Def;
		FString Str;
		if (Obj->TryGetStringField(TEXT("ref"), Str)) Def.Ref = FName(*Str);
		if (Def.Ref.IsNone()) continue;

		Obj->TryGetStringField(TEXT("id"), Def.Id);
		Obj->TryGetStringField(TEXT("name"), Def.Name);
		Obj->TryGetStringField(TEXT("description"), Def.Description);
		if (Obj->TryGetStringField(TEXT("type"), Str)) Def.Type = FName(*Str);
		if (Obj->TryGetStringField(TEXT("subKind"), Str)) Def.SubKind = FName(*Str);
		Obj->TryGetStringField(TEXT("img"), Def.Img);
		Obj->TryGetBoolField(TEXT("interactable"), Def.bInteractable);
		Obj->TryGetBoolField(TEXT("destructible"), Def.bDestructible);
		if (Obj->TryGetStringField(TEXT("harvestYield"), Str)) Def.HarvestYield = FName(*Str);
		Obj->TryGetNumberField(TEXT("maxAmount"), Def.MaxAmount);
		Obj->TryGetNumberField(TEXT("initialAmount"), Def.InitialAmount);
		Obj->TryGetNumberField(TEXT("harvestTimeMs"), Def.HarvestTimeMs);
		GetFloat(Obj, TEXT("spawnWeight"), Def.SpawnWeight);
		Obj->TryGetNumberField(TEXT("spawnCount"), Def.SpawnCount);

		RefToIndex.Add(Def.Ref, ObjectDefs.Num());
		ObjectDefs.Add(MoveTemp(Def));
	}

	UE_LOG(LogTemp, Log, TEXT("[KBVEMapDB] loaded %d world-object defs"), ObjectDefs.Num());
	return true;
}

const FKBVEWorldObjectDef* UKBVEMapDatabase::FindObjectByRef(FName Ref) const
{
	if (const int32* Index = RefToIndex.Find(Ref))
	{
		return &ObjectDefs[*Index];
	}
	return nullptr;
}

bool UKBVEMapDatabase::GetObjectByRef(FName Ref, FKBVEWorldObjectDef& OutDef) const
{
	if (const FKBVEWorldObjectDef* Def = FindObjectByRef(Ref))
	{
		OutDef = *Def;
		return true;
	}
	return false;
}
