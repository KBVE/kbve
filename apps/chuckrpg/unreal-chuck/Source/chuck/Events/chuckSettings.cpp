#include "chuckSettings.h"

#include "KBVESettingsStore.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/Paths.h"

namespace
{
	const FString GWindowScope = TEXT("window");

	FString GeometryToValue(const FchuckWindowGeometry& G)
	{
		return FString::Printf(TEXT("%f,%f,%f,%f"), G.Position.X, G.Position.Y, G.Size.X, G.Size.Y);
	}

	bool ValueToGeometry(const FString& Value, FchuckWindowGeometry& Out)
	{
		TArray<FString> Parts;
		Value.ParseIntoArray(Parts, TEXT(","));
		if (Parts.Num() != 4) return false;
		Out.Position = FVector2D(FCString::Atod(*Parts[0]), FCString::Atod(*Parts[1]));
		Out.Size     = FVector2D(FCString::Atod(*Parts[2]), FCString::Atod(*Parts[3]));
		return true;
	}
}

UchuckSettings::UchuckSettings() = default;
UchuckSettings::~UchuckSettings() = default;

UchuckSettings* UchuckSettings::Get(const UObject* WorldContext)
{
	if (!WorldContext) return nullptr;
	UWorld* World = WorldContext->GetWorld();
	if (!World) return nullptr;
	UGameInstance* GI = World->GetGameInstance();
	return GI ? GI->GetSubsystem<UchuckSettings>() : nullptr;
}

void UchuckSettings::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Store = MakeUnique<FKBVESettingsStore>();
	const FString DbPath = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("KBVE"), TEXT("settings.db"));
	Store->Open(DbPath);
	LoadAll();
}

void UchuckSettings::Deinitialize()
{
	if (Store.IsValid())
	{
		Store->Close();
		Store.Reset();
	}
	WindowStates.Empty();
	Super::Deinitialize();
}

bool UchuckSettings::GetWindowGeometry(FName WindowKey, FchuckWindowGeometry& OutGeometry) const
{
	if (const FchuckWindowGeometry* Found = WindowStates.Find(WindowKey))
	{
		OutGeometry = *Found;
		return true;
	}
	return false;
}

void UchuckSettings::SetWindowGeometry(const FchuckWindowGeometry& InGeometry)
{
	WindowStates.FindOrAdd(InGeometry.WindowKey) = InGeometry;
	if (Store.IsValid())
	{
		Store->SetString(GWindowScope, InGeometry.WindowKey.ToString(), GeometryToValue(InGeometry));
	}
}

void UchuckSettings::LoadAll()
{
	if (!Store.IsValid()) return;
	TMap<FString, FString> Pairs;
	if (!Store->LoadScope(GWindowScope, Pairs)) return;
	for (const TPair<FString, FString>& Pair : Pairs)
	{
		FchuckWindowGeometry G;
		G.WindowKey = FName(*Pair.Key);
		if (ValueToGeometry(Pair.Value, G))
		{
			WindowStates.Add(G.WindowKey, G);
		}
	}
}
