#pragma once

#include "CoreMinimal.h"
#include "KBVEItemTypes.generated.h"

UENUM(BlueprintType)
enum class EKBVEItemRarity : uint8
{
	Common,
	Uncommon,
	Rare,
	Epic,
	Legendary,
	Mythic
};

USTRUCT(BlueprintType)
struct FKBVEConsumeStatus
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FName Kind;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 Stacks = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float Duration = 0.f;
};

USTRUCT(BlueprintType)
struct FKBVEItemFood
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float Heals = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float RestoreMana = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float RestoreEnergy = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float RegenPerSecond = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float RegenDuration = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	bool bPerishable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 ShelfLifeSeconds = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FName SpoilsIntoRef;
};

USTRUCT(BlueprintType)
struct FKBVEItemDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 Key = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FString Emoji;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	bool bHasImg = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 TypeFlags = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	EKBVEItemRarity Rarity = EKBVEItemRarity::Common;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 MaxStack = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	bool bStackable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 BuyPrice = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	int32 SellPrice = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float Weight = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	bool bConsumable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float Cooldown = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FString Action;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FName AnimationRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FName SoundRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	TArray<FName> Tags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	bool bHasFood = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	FKBVEItemFood Food;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	float ConsumeBuffDuration = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Item")
	TArray<FKBVEConsumeStatus> ConsumeStatuses;

	static constexpr int32 TypeBit_Food   = 0x00000008;
	static constexpr int32 TypeBit_Drink  = 0x00000010;
	static constexpr int32 TypeBit_Potion = 0x00000020;

	bool IsFood()   const { return (TypeFlags & TypeBit_Food)   != 0; }
	bool IsDrink()  const { return (TypeFlags & TypeBit_Drink)  != 0; }
	bool IsPotion() const { return (TypeFlags & TypeBit_Potion) != 0; }

	bool IsValid() const { return Key > 0 && !Ref.IsNone(); }
	bool HasConsumeEffect() const
	{
		return bConsumable && (Food.Heals > 0.f || Food.RestoreMana > 0.f || Food.RestoreEnergy > 0.f || Food.RegenPerSecond > 0.f);
	}
};

namespace KBVEItem
{
	FORCEINLINE FLinearColor RarityColor(EKBVEItemRarity Rarity)
	{
		switch (Rarity)
		{
			case EKBVEItemRarity::Common:    return FLinearColor(0.65f, 0.65f, 0.65f, 1.f);
			case EKBVEItemRarity::Uncommon:  return FLinearColor(0.20f, 0.85f, 0.20f, 1.f);
			case EKBVEItemRarity::Rare:      return FLinearColor(0.25f, 0.55f, 1.00f, 1.f);
			case EKBVEItemRarity::Epic:      return FLinearColor(0.65f, 0.30f, 0.95f, 1.f);
			case EKBVEItemRarity::Legendary: return FLinearColor(1.00f, 0.55f, 0.10f, 1.f);
			case EKBVEItemRarity::Mythic:    return FLinearColor(1.00f, 0.20f, 0.60f, 1.f);
			default:                         return FLinearColor::White;
		}
	}
}
