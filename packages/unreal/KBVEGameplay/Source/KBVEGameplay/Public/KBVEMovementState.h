#pragma once

#include "CoreMinimal.h"
#include "Misc/EnumClassFlags.h"

enum class EKBVEMovementState : uint8
{
	None      = 0,
	OnGround  = 1 << 0,
	InAir     = 1 << 1,
	Moving    = 1 << 2,
	Sprinting = 1 << 3,
	Crouching = 1 << 4,
	Falling   = 1 << 5,
	Swimming  = 1 << 6,
	Climbing  = 1 << 7,
};
ENUM_CLASS_FLAGS(EKBVEMovementState);

namespace KBVEMove
{
	FORCEINLINE bool Has(EKBVEMovementState S, EKBVEMovementState Flag)    { return EnumHasAllFlags(S, Flag); }
	FORCEINLINE bool HasAny(EKBVEMovementState S, EKBVEMovementState Flags) { return EnumHasAnyFlags(S, Flags); }
	FORCEINLINE void Set(EKBVEMovementState& S, EKBVEMovementState Flag)    { EnumAddFlags(S, Flag); }
	FORCEINLINE void Clear(EKBVEMovementState& S, EKBVEMovementState Flag)  { EnumRemoveFlags(S, Flag); }
	FORCEINLINE void Assign(EKBVEMovementState& S, EKBVEMovementState Flag, bool bOn)
	{
		if (bOn) EnumAddFlags(S, Flag); else EnumRemoveFlags(S, Flag);
	}
}
