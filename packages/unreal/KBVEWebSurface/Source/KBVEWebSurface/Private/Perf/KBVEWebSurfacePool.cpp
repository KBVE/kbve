#include "Perf/KBVEWebSurfacePool.h"

#include "Components/KBVEWebSurfaceComponent.h"

bool UKBVEWebSurfacePool::RequestLiveSlot(UKBVEWebSurfaceComponent* Surface)
{
	if (!Surface)
	{
		return false;
	}
	if (Live.Num() >= MaxConcurrent && Live.Num() > 0)
	{
		Live.RemoveAt(0);
	}
	Live.Add(Surface);
	return true;
}

void UKBVEWebSurfacePool::Release(UKBVEWebSurfaceComponent* Surface)
{
	Live.RemoveAll([Surface](const TWeakObjectPtr<UKBVEWebSurfaceComponent>& W)
	{
		return W.Get() == Surface;
	});
}
