#include "chuckMovementPolicy.h"

EKBVEMovementBackend UchuckMovementPolicy::ResolveBackend_Implementation(const FKBVEMovementContext& Context) const
{
	if (Context.bIsPlayerControlled)
	{
		return EKBVEMovementBackend::CMC;
	}
	if (Context.DistanceToViewer > FarDistance)
	{
		return EKBVEMovementBackend::Mass;
	}
	return EKBVEMovementBackend::Mass;
}
