#include "chuckUIEvents.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"

UchuckUIEvents* UchuckUIEvents::Get(const UObject* WorldContext)
{
	if (!WorldContext) return nullptr;
	UWorld* World = WorldContext->GetWorld();
	if (!World) return nullptr;
	UGameInstance* GI = World->GetGameInstance();
	return GI ? GI->GetSubsystem<UchuckUIEvents>() : nullptr;
}
