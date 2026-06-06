#include "Actors/KBVEWebKioskActor.h"

#include "Components/KBVEWebSurfaceComponent.h"

AKBVEWebKioskActor::AKBVEWebKioskActor()
{
	if (Surface)
	{
		Surface->MaxFrameRate = 15;
		Surface->SnapshotDistance = 800.f;
		Surface->bPauseWhenOffscreen = true;
	}
}
