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

	bool IsValid() const { return Key > 0 && !Ref.IsNone(); }
	bool HasConsumeEffect() const
	{
		return bConsumable && (Food.Heals > 0.f || Food.RestoreMana > 0.f || Food.RestoreEnergy > 0.f || Food.RegenPerSecond > 0.f);
	}
};
