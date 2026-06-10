#pragma once

#include "CoreMinimal.h"
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
