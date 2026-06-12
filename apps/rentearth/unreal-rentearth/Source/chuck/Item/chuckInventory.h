#pragma once

#include "CoreMinimal.h"
#include "Net/Serialization/FastArraySerializer.h"
#include "chuckInventory.generated.h"

UENUM(BlueprintType, meta = (Bitflags))
enum class EchuckStackFlag : uint8
{
	None       = 0,
	Locked     = 1 << 0,
	Soulbound  = 1 << 1,
	Equipped   = 1 << 2,
	HasInstance = 1 << 3
};

USTRUCT(BlueprintType)
struct FchuckInventoryStack : public FFastArraySerializerItem
{
	GENERATED_BODY()

	UPROPERTY() int32 ItemKey = 0;
	UPROPERTY() int32 Count = 0;
	UPROPERTY() int32 Durability = 0;
	UPROPERTY() uint8 Flags = 0;
	UPROPERTY() int32 InstanceIdx = -1;
	UPROPERTY() int64 UlidHigh = 0;
	UPROPERTY() int64 UlidLow  = 0;

	FORCEINLINE bool IsEmpty() const { return ItemKey <= 0 || Count <= 0; }
	FORCEINLINE bool HasUlid() const { return UlidHigh != 0 || UlidLow != 0; }

	void GenerateUlid();
	void ClearUlid();
	FString UlidToString() const;
};

USTRUCT(BlueprintType)
struct FchuckInventoryBag : public FFastArraySerializer
{
	GENERATED_BODY()

	UPROPERTY() FName BagRef;
	UPROPERTY() int32 Capacity = 24;

	UPROPERTY()
	TArray<FchuckInventoryStack> Slots;

	bool NetDeltaSerialize(FNetDeltaSerializeInfo& DeltaParms)
	{
		return FFastArraySerializer::FastArrayDeltaSerialize<FchuckInventoryStack, FchuckInventoryBag>(Slots, DeltaParms, *this);
	}

	void EnsureSize()
	{
		if (Slots.Num() < Capacity)
		{
			Slots.SetNum(Capacity);
			MarkArrayDirty();
		}
	}
};

template<>
struct TStructOpsTypeTraits<FchuckInventoryBag> : public TStructOpsTypeTraitsBase2<FchuckInventoryBag>
{
	enum
	{
		WithNetDeltaSerializer = true
	};
};

USTRUCT(BlueprintType)
struct FchuckInventory
{
	GENERATED_BODY()

	UPROPERTY() FchuckInventoryBag DefaultBag;
	UPROPERTY() FchuckInventoryBag Hotbar;

	void InitDefaults()
	{
		DefaultBag.Capacity = 24;
		Hotbar.Capacity     = 12;
		DefaultBag.EnsureSize();
		Hotbar.EnsureSize();
	}
};

namespace chuckInventory
{
	int32 TryAdd(FchuckInventoryBag& Bag, int32 ItemKey, int32 Count, int32 MaxStack, bool bStackable);
}
