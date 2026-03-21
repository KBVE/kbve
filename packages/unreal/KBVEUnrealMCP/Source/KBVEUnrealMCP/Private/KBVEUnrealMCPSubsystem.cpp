#include "KBVEUnrealMCPSubsystem.h"
#include "Editor.h"

void UKBVEUnrealMCPSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UKBVEUnrealMCPSubsystem::Deinitialize()
{
	Super::Deinitialize();
}

UWorld* UKBVEUnrealMCPSubsystem::GetEditorWorld() const
{
	if (GEditor)
	{
		return GEditor->GetEditorWorldContext().World();
	}
	return nullptr;
}
