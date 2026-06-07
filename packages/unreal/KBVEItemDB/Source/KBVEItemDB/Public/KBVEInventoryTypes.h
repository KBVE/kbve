#pragma once

#include "CoreMinimal.h"
#include "KBVEInventoryTypes.generated.h"

UENUM(BlueprintType, meta = (Bitflags))
enum class EKBVEStackFlag : uint8
{
	None       = 0,
	Locked     = 1 << 0,
	Soulbound  = 1 << 1,
	Equipped   = 1 << 2,
	HasInstance = 1 << 3
};

USTRUCT(BlueprintType)
struct FKBVEInventoryStack
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	int32 ItemKey = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	int32 Count = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	int32 Durability = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	uint8 Flags = 0;

	bool IsEmpty() const { return ItemKey <= 0 || Count <= 0; }
};

USTRUCT(BlueprintType)
struct FKBVEInventoryBag
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	FName BagRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	int32 Capacity = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	TArray<FKBVEInventoryStack> Slots;

	void EnsureSize()
	{
		if (Slots.Num() < Capacity)
		{
			Slots.SetNum(Capacity);
		}
	}
};

USTRUCT(BlueprintType)
struct FKBVEInventory
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	FKBVEInventoryBag DefaultBag;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Inventory")
	FKBVEInventoryBag Hotbar;

	void InitDefaults(int32 BagCapacity = 24, int32 HotbarCapacity = 12)
	{
		DefaultBag.BagRef = TEXT("default");
		DefaultBag.Capacity = BagCapacity;
		DefaultBag.EnsureSize();
		Hotbar.BagRef = TEXT("hotbar");
		Hotbar.Capacity = HotbarCapacity;
		Hotbar.EnsureSize();
	}
};
