#pragma once

#include "CoreMinimal.h"
#include "chuckItemTypes.generated.h"

UENUM(BlueprintType)
enum class EchuckItemRarity : uint8
{
	Common    = 0,
	Uncommon  = 1,
	Rare      = 2,
	Epic      = 3,
	Legendary = 4,
	Mythic    = 5
};

USTRUCT(BlueprintType)
struct FchuckItemDef
{
	GENERATED_BODY()

	UPROPERTY() int32  Key = 0;
	UPROPERTY() FName  Ref;
	UPROPERTY() FString Name;
	UPROPERTY() FString Description;
	UPROPERTY() FString Emoji;
	UPROPERTY() int32  TypeFlags = 0;
	UPROPERTY() EchuckItemRarity Rarity = EchuckItemRarity::Common;
	UPROPERTY() int32  MaxStack = 1;
	UPROPERTY() bool   bStackable = false;
	UPROPERTY() int32  BuyPrice = 0;
	UPROPERTY() int32  SellPrice = 0;
	UPROPERTY() bool   bConsumable = false;
	UPROPERTY() FString ULID;

	bool IsValid() const { return Key > 0 && !Ref.IsNone(); }
};

namespace chuckItem
{
	FORCEINLINE FLinearColor RarityColor(EchuckItemRarity Rarity)
	{
		switch (Rarity)
		{
			case EchuckItemRarity::Common:    return FLinearColor(0.65f, 0.65f, 0.65f, 1.f);
			case EchuckItemRarity::Uncommon:  return FLinearColor(0.20f, 0.85f, 0.20f, 1.f);
			case EchuckItemRarity::Rare:      return FLinearColor(0.25f, 0.55f, 1.00f, 1.f);
			case EchuckItemRarity::Epic:      return FLinearColor(0.65f, 0.30f, 0.95f, 1.f);
			case EchuckItemRarity::Legendary: return FLinearColor(1.00f, 0.55f, 0.10f, 1.f);
			case EchuckItemRarity::Mythic:    return FLinearColor(1.00f, 0.20f, 0.60f, 1.f);
			default:                          return FLinearColor::White;
		}
	}
}
