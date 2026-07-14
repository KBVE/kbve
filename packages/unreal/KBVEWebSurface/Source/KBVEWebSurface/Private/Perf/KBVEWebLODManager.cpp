#include "Perf/KBVEWebLODManager.h"

#include "Components/KBVEWebSurfaceComponent.h"

void UKBVEWebLODManager::Tick(float DeltaTime)
{
	for (int32 i = Surfaces.Num() - 1; i >= 0; --i)
	{
		if (!Surfaces[i].IsValid())
		{
			Surfaces.RemoveAtSwap(i);
		}
	}
}

TStatId UKBVEWebLODManager::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UKBVEWebLODManager, STATGROUP_Tickables);
}

void UKBVEWebLODManager::Register(UKBVEWebSurfaceComponent* Surface)
{
	if (Surface)
	{
		Surfaces.AddUnique(Surface);
	}
}

void UKBVEWebLODManager::Unregister(UKBVEWebSurfaceComponent* Surface)
{
	Surfaces.RemoveAll([Surface](const TWeakObjectPtr<UKBVEWebSurfaceComponent>& W)
	{
		return W.Get() == Surface;
	});
}
