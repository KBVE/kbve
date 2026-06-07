#include "KBVEInventoryLibrary.h"

int32 UKBVEInventoryLibrary::TryAdd(FKBVEInventoryBag& Bag, int32 ItemKey, int32 Count, int32 MaxStack, bool bStackable)
{
	if (ItemKey <= 0 || Count <= 0)
	{
		return Count;
	}

	Bag.EnsureSize();
	const int32 Cap = FMath::Max(1, MaxStack);
	int32 Remaining = Count;

	if (bStackable)
	{
		for (FKBVEInventoryStack& Slot : Bag.Slots)
		{
			if (Remaining <= 0) break;
			if (Slot.ItemKey == ItemKey && Slot.Count < Cap)
			{
				const int32 Add = FMath::Min(Remaining, Cap - Slot.Count);
				Slot.Count += Add;
				Remaining  -= Add;
			}
		}
	}

	for (FKBVEInventoryStack& Slot : Bag.Slots)
	{
		if (Remaining <= 0) break;
		if (Slot.IsEmpty())
		{
			Slot.ItemKey = ItemKey;
			const int32 Add = bStackable ? FMath::Min(Remaining, Cap) : 1;
			Slot.Count = Add;
			Remaining -= Add;
		}
	}

	return Remaining;
}

int32 UKBVEInventoryLibrary::CountItem(const FKBVEInventoryBag& Bag, int32 ItemKey)
{
	int32 Total = 0;
	for (const FKBVEInventoryStack& Slot : Bag.Slots)
	{
		if (Slot.ItemKey == ItemKey)
		{
			Total += Slot.Count;
		}
	}
	return Total;
}

int32 UKBVEInventoryLibrary::FindFirstSlot(const FKBVEInventoryBag& Bag, int32 ItemKey)
{
	for (int32 i = 0; i < Bag.Slots.Num(); ++i)
	{
		if (Bag.Slots[i].ItemKey == ItemKey)
		{
			return i;
		}
	}
	return INDEX_NONE;
}
