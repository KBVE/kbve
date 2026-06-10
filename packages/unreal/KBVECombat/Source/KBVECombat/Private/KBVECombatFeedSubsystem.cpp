#include "KBVECombatFeedSubsystem.h"
#include "Engine/World.h"
#include "Engine/Engine.h"

UKBVECombatFeedSubsystem* UKBVECombatFeedSubsystem::Get(const UObject* WorldContext)
{
	if (const UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr)
	{
		return World->GetSubsystem<UKBVECombatFeedSubsystem>();
	}
	return nullptr;
}

void UKBVECombatFeedSubsystem::PushEvent(const FKBVECombatFeedEntry& Entry)
{
	if (Recent.Num() < MaxEntries)
	{
		Recent.Add(Entry);
	}
	else
	{
		Recent[Head] = Entry;
		Head = (Head + 1) % MaxEntries;
	}
	OnCombatEvent.Broadcast(Entry);
}
