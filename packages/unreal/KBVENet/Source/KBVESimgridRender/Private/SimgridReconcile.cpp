#include "SimgridReconcile.h"
#include "SimgridProto.h"

TSet<uint32> FSimgridReconcile::DespawnSet(const TSet<uint32>& Live, const TArray<FSimgridEntityDelta>& Keyframe)
{
	TSet<uint32> Present;
	Present.Reserve(Keyframe.Num());
	for (const FSimgridEntityDelta& E : Keyframe)
	{
		Present.Add(E.Eid);
	}

	TSet<uint32> Gone;
	for (const uint32 Eid : Live)
	{
		if (!Present.Contains(Eid))
		{
			Gone.Add(Eid);
		}
	}
	return Gone;
}

TSet<uint32> FSimgridReconcile::DestroyedIds(const TArray<FSimgridEntityDelta>& Entities)
{
	TSet<uint32> Dead;
	for (const FSimgridEntityDelta& E : Entities)
	{
		if (E.bDestroyed)
		{
			Dead.Add(E.Eid);
		}
	}
	return Dead;
}
