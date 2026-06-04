#pragma once

#include "CoreMinimal.h"
#include "Misc/EnumClassFlags.h"

enum class EchuckMoveState : uint8
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
ENUM_CLASS_FLAGS(EchuckMoveState);

namespace chuckMove
{
	FORCEINLINE bool Has(EchuckMoveState S, EchuckMoveState Flag)
	{
		return EnumHasAllFlags(S, Flag);
	}

	FORCEINLINE bool HasAny(EchuckMoveState S, EchuckMoveState Flags)
	{
		return EnumHasAnyFlags(S, Flags);
	}

	FORCEINLINE void Set(EchuckMoveState& S, EchuckMoveState Flag)
	{
		EnumAddFlags(S, Flag);
	}

	FORCEINLINE void Clear(EchuckMoveState& S, EchuckMoveState Flag)
	{
		EnumRemoveFlags(S, Flag);
	}

	FORCEINLINE void Assign(EchuckMoveState& S, EchuckMoveState Flag, bool bOn)
	{
		if (bOn) EnumAddFlags(S, Flag);
		else     EnumRemoveFlags(S, Flag);
	}
}
