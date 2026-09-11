#pragma once

#include "CoreMinimal.h"

/**
 * Which instance of a shared component each key owns, across a moving window.
 *
 * An instanced component holding the whole world's copies of one mesh is the
 * cheapest way to draw them, and rebuilding it from scratch whenever one chunk
 * of that world changes is the most expensive way to maintain it: the cost is
 * the size of the world rather than the size of the change, and the component
 * draws nothing at all until it has been refilled.
 *
 * Slots are handed out instead, and never taken back. A key that goes away
 * leaves its slots parked rather than removed, so no index any other key holds
 * ever shifts, and the next key to arrive is written into the parked ones. A
 * window that moves across a world settles at about the number of slots the
 * window itself needs, and the arithmetic that would otherwise have to mirror
 * how the engine shuffles indices on removal does not have to exist.
 *
 * Pure index bookkeeping, and deliberately so: what it decides is testable
 * without a component, a world or a renderer.
 */
struct KBVEWORLDCORE_API FKBVEWorldInstanceSlots
{
	/**
	 * Give a key the slots for its transforms, and park whatever it no longer
	 * needs.
	 *
	 * OutSlots is one slot per transform, in the order they were submitted. A
	 * slot at or past Total() before the call is one the caller has to append,
	 * and those come back in ascending order so appending them in the order they
	 * appear puts each transform where it was promised.
	 *
	 * A key keeps the slots it already holds wherever it can, so a key whose
	 * count has not changed writes over itself and nothing moves.
	 */
	void Assign(const FIntPoint& Key, int32 Num, TArray<int32>& OutSlots,
		TArray<int32>& OutParked);

	/** Park everything a key holds, for a chunk leaving the window. */
	void Drop(const FIntPoint& Key, TArray<int32>& OutParked);

	/** Park every slot every key holds, keeping them all available to reuse. */
	void Reset(TArray<int32>& OutParked);

	/** How many slots have been handed out, parked ones included. */
	int32 Total() const { return Count; }

	/** How many are parked and waiting to be written over. */
	int32 Parked() const { return Free.Num(); }

	/** Whether a key holds anything at all. */
	bool Holds(const FIntPoint& Key) const { return Owned.Contains(Key); }

private:
	TMap<FIntPoint, TArray<int32>> Owned;
	TArray<int32> Free;
	int32 Count = 0;
};
