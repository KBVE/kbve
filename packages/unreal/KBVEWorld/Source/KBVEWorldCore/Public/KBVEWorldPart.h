#pragma once

#include "CoreMinimal.h"

/**
 * One box a world feature stands somewhere, as a place and a size.
 *
 * Kept as a centre, a rotation and a size rather than as a transform so that a
 * caller can scale whatever mesh a level gave it onto the box. A pier or a fence
 * post has no idea how big the cube it is being drawn with was authored.
 *
 * The unit of instancing across the world: anything repeated enough to be worth
 * drawing as instances rather than as geometry per chunk comes back as these,
 * and the actor that owns the pool turns them into transforms once it knows
 * which mesh it was given.
 */
struct FKBVEWorldPart
{
	FVector Centre = FVector::ZeroVector;
	FQuat Rotation = FQuat::Identity;
	FVector Size = FVector::ZeroVector;
};
