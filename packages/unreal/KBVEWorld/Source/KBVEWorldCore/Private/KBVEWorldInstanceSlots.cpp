#include "KBVEWorldInstanceSlots.h"

void FKBVEWorldInstanceSlots::Assign(const FIntPoint& Key, int32 Num,
	TArray<int32>& OutSlots, TArray<int32>& OutParked)
{
	OutSlots.Reset();
	OutParked.Reset();

	const int32 Wanted = FMath::Max(Num, 0);
	if (Wanted == 0)
	{
		Drop(Key, OutParked);
		return;
	}

	TArray<int32>& Held = Owned.FindOrAdd(Key);
	OutSlots.Reserve(Wanted);

	// Its own slots before anything else, so a key that has not changed size
	// writes over exactly where it already was. Nothing else in the component
	// moves, and the instances of one chunk stay next to each other, which is
	// what the tree over them was built expecting.
	const int32 Reused = FMath::Min(Held.Num(), Wanted);
	for (int32 I = 0; I < Reused; ++I)
	{
		OutSlots.Add(Held[I]);
	}

	// Then whatever some other key left behind. Taking from the end is what
	// makes a moving window settle: the slots a chunk just gave up are the ones
	// the chunk arriving on the other side is written into.
	for (int32 I = Reused; I < Wanted && Free.Num() > 0; ++I)
	{
		OutSlots.Add(Free.Pop(EAllowShrinking::No));
	}

	// Only then new ground. Ascending, because the caller appends them in this
	// order and an append lands at the end of the component.
	while (OutSlots.Num() < Wanted)
	{
		OutSlots.Add(Count++);
	}

	// What it held and no longer needs. Parked rather than removed: an index the
	// component has handed out stays valid for as long as the component does.
	for (int32 I = Wanted; I < Held.Num(); ++I)
	{
		OutParked.Add(Held[I]);
		Free.Add(Held[I]);
	}

	Held = OutSlots;
}

void FKBVEWorldInstanceSlots::Drop(const FIntPoint& Key, TArray<int32>& OutParked)
{
	OutParked.Reset();

	TArray<int32> Held;
	if (!Owned.RemoveAndCopyValue(Key, Held))
	{
		return;
	}

	OutParked = Held;
	Free.Append(Held);
}

void FKBVEWorldInstanceSlots::Reset(TArray<int32>& OutParked)
{
	OutParked.Reset();

	for (const TPair<FIntPoint, TArray<int32>>& Pair : Owned)
	{
		OutParked.Append(Pair.Value);
		Free.Append(Pair.Value);
	}

	Owned.Reset();
}
