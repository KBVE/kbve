#pragma once

#include "CoreMinimal.h"
#include "KBVEUIState.generated.h"

USTRUCT(BlueprintType)
struct KBVEUI_API FKBVEUIState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|UIState")
	int32 Flags = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|UIState")
	int32 NeedsCursorMask = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|UIState")
	int32 BlockMovementMask = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|UIState")
	int32 BlockCameraMask = 0;

	bool Has(int32 Flag) const     { return (Flags & Flag) != 0; }
	bool HasAny(int32 Mask) const  { return (Flags & Mask) != 0; }
	bool HasAll(int32 Mask) const  { return Mask != 0 && (Flags & Mask) == Mask; }
	bool AnyOpen() const           { return Flags != 0; }

	/** Applies a flag; returns the previous flag set (for diff / change broadcast). */
	int32 Set(int32 Flag, bool bOn)
	{
		const int32 Prev = Flags;
		if (bOn) { Flags |= Flag; } else { Flags &= ~Flag; }
		return Prev;
	}

	int32 Toggle(int32 Flag)
	{
		const int32 Prev = Flags;
		Flags ^= Flag;
		return Prev;
	}

	void Clear() { Flags = 0; }

	/** Bits that changed relative to a previous snapshot. */
	int32 Diff(int32 Prev) const { return Flags ^ Prev; }

	bool NeedsCursor() const    { return (Flags & NeedsCursorMask) != 0; }
	bool BlocksMovement() const { return (Flags & BlockMovementMask) != 0; }
	bool BlocksCamera() const   { return (Flags & BlockCameraMask) != 0; }
};
