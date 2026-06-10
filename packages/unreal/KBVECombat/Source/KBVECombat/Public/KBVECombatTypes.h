#pragma once

#include "CoreMinimal.h"
#include "MassEntityHandle.h"
#include "KBVECombatTypes.generated.h"

/** Damage school — mirrors the npcdb Element taxonomy without coupling to its generated proto. */
UENUM(BlueprintType)
enum class EKBVEDamageElement : uint8
{
	None,
	Physical,
	Fire,
	Ice,
	Lightning,
	Poison,
	Holy,
	Shadow,
	Arcane,
	Nature
};

/** A single damage application. Resolved against the target's Health stat (IKBVEStatTarget). */
USTRUCT(BlueprintType)
struct FKBVEDamageEvent
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float Amount = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEDamageElement Element = EKBVEDamageElement::Physical;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	TObjectPtr<AActor> Instigator = nullptr;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	FVector HitLocation = FVector::ZeroVector;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	FName HitBone;
};

/** Per-element damage multiplier. <1 = resist, >1 = weakness, 0 = immune. */
USTRUCT(BlueprintType)
struct FKBVEElementAffinity
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEDamageElement Element = EKBVEDamageElement::Physical;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0"))
	float Multiplier = 1.0f;
};

/** A loot roll entry — generic (item ref + chance); the game maps refs to its item DB. */
USTRUCT(BlueprintType)
struct FKBVELootEntry
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	FName ItemRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float DropRate = 1.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "1"))
	int32 MinQuantity = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat", meta = (ClampMin = "1"))
	int32 MaxQuantity = 1;
};

/** A rolled drop result (item + quantity). */
USTRUCT(BlueprintType)
struct FKBVELootDrop
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	FName ItemRef;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	int32 Quantity = 1;
};

USTRUCT(BlueprintType)
struct FKBVEDamageRequest
{
	GENERATED_BODY()

	UPROPERTY()
	FMassEntityHandle Target;

	UPROPERTY()
	FMassEntityHandle Instigator;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	float Amount = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEDamageElement Element = EKBVEDamageElement::Physical;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	FVector HitLocation = FVector::ZeroVector;
};

UENUM(BlueprintType)
enum class EKBVECombatEventType : uint8
{
	Damage,
	Heal,
	Death,
	Ability
};

/** One entry in the combat-event feed (damage numbers, combat log, UI). */
USTRUCT(BlueprintType)
struct FKBVECombatFeedEntry
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVECombatEventType Type = EKBVECombatEventType::Damage;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	TObjectPtr<AActor> Instigator = nullptr;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	TObjectPtr<AActor> Target = nullptr;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	float Amount = 0.0f;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	EKBVEDamageElement Element = EKBVEDamageElement::None;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	FName Label;

	UPROPERTY(BlueprintReadWrite, Category = "KBVE|Combat")
	FVector WorldLocation = FVector::ZeroVector;
};
