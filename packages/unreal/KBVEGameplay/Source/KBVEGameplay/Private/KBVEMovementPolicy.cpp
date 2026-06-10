#include "KBVEMovementPolicy.h"

EKBVEMovementBackend UKBVEMovementPolicy::ResolveBackend_Implementation(const FKBVEMovementContext& Context) const
{
	// Player-controlled avatars always get prediction-grade CMC.
	if (Context.bIsPlayerControlled)
	{
		return EKBVEMovementBackend::CMC;
	}

	// Far / ambient agents collapse to Mass (replicated snapshots, no per-actor movement).
	if (Context.DistanceToViewer > FarDistance)
	{
		return EKBVEMovementBackend::Mass;
	}

	// Combatants need authoritative prediction/correction.
	if (Context.bInCombat)
	{
		return EKBVEMovementBackend::CMC;
	}

	// Peaceful, dense populations (e.g. a city) — Mover scales better than CMC.
	if (Context.LocalPopulation >= CrowdPopulationThreshold)
	{
		return EKBVEMovementBackend::Mover;
	}

	return EKBVEMovementBackend::CMC;
}
