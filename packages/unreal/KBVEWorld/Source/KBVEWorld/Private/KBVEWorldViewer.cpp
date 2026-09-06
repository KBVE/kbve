#include "KBVEWorldViewer.h"

#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"

void UKBVEWorldViewerSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	const APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	if (!Pawn)
	{
		return;
	}

	ViewLocation = Pawn->GetActorLocation();
	bHasViewer = true;
}

TStatId UKBVEWorldViewerSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UKBVEWorldViewerSubsystem, STATGROUP_Tickables);
}
