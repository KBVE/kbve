#include "chuckInventory.h"

#include "KBVEULID.h"

void FchuckInventoryStack::GenerateUlid()
{
	const FKBVEUlid Id = FKBVEUlid::New();
	int64 H = 0;
	int64 L = 0;
	FMemory::Memcpy(&H, Id.Bytes + 0, 8);
	FMemory::Memcpy(&L, Id.Bytes + 8, 8);
	UlidHigh = H;
	UlidLow  = L;
}

void FchuckInventoryStack::ClearUlid()
{
	UlidHigh = 0;
	UlidLow  = 0;
}

FString FchuckInventoryStack::UlidToString() const
{
	FKBVEUlid Id;
	FMemory::Memcpy(Id.Bytes + 0, &UlidHigh, 8);
	FMemory::Memcpy(Id.Bytes + 8, &UlidLow,  8);
	return Id.ToString();
}

namespace chuckInventory
{
	int32 TryAdd(FchuckInventoryBag& Bag, int32 ItemKey, int32 Count, int32 MaxStack, bool bStackable)
	{
		if (ItemKey <= 0 || Count <= 0)
		{
			return Count;
		}

		Bag.EnsureSize();
		int32 Remaining = Count;

		if (bStackable && MaxStack > 1)
		{
			for (int32 i = 0; i < Bag.Slots.Num() && Remaining > 0; ++i)
			{
				FchuckInventoryStack& S = Bag.Slots[i];
				if (S.ItemKey == ItemKey && S.Count < MaxStack)
				{
					const int32 Space = MaxStack - S.Count;
					const int32 Take  = FMath::Min(Space, Remaining);
					S.Count    += Take;
					Remaining  -= Take;
					Bag.MarkItemDirty(S);
				}
			}
		}

		for (int32 i = 0; i < Bag.Slots.Num() && Remaining > 0; ++i)
		{
			FchuckInventoryStack& S = Bag.Slots[i];
			if (S.IsEmpty())
			{
				const int32 Take = bStackable && MaxStack > 1
					? FMath::Min(MaxStack, Remaining)
					: 1;
				S.ItemKey = ItemKey;
				S.Count   = Take;
				S.Durability = 0;
				S.Flags = 0;
				S.InstanceIdx = -1;
				S.GenerateUlid();
				Remaining -= Take;
				Bag.MarkItemDirty(S);
			}
		}

		return Remaining;
	}
}
