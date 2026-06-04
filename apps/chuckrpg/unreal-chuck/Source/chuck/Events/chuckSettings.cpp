#include "chuckSettings.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

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
	LoadAll();
}

void UchuckSettings::Deinitialize()
{
	SaveAll();
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
	// TODO(KBVESQLite): replace this lazy save with a transactional UPSERT
	// on a chuck_window_state(key, pos_x, pos_y, size_x, size_y) table once
	// the sqlite binding is wired. For now we coast on in-memory only --
	// state persists across map travel within a session but not across
	// process restarts.
}

void UchuckSettings::LoadAll()
{
	// TODO(KBVESQLite): open ~/Documents/chuckrpg/settings.db, SELECT *
	// FROM chuck_window_state and populate WindowStates.
}

void UchuckSettings::SaveAll()
{
	// TODO(KBVESQLite): begin transaction, UPSERT each WindowStates entry,
	// commit. Run on Deinitialize + on a periodic timer so we don't lose
	// state on a hard crash.
}
