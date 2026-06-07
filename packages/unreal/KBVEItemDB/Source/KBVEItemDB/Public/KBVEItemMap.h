#pragma once

#include "CoreMinimal.h"
#include "KBVEItemTypes.h"
#include "Generated/KBVEItemDBProtoTypes.h"

// Single DTO -> domain mapping: generated proto-mirror (FKBVEGenItem) -> curated
// runtime def (FKBVEItemDef). Shared by every loader (plugin UKBVEItemDatabase,
// chuck UchuckItemDB) so there is exactly one place that interprets item data.

namespace KBVEItemMap
{
	FORCEINLINE EKBVEItemRarity ParseRarity(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.Contains(TEXT("MYTHIC")))    return EKBVEItemRarity::Mythic;
		if (R.Contains(TEXT("LEGENDARY"))) return EKBVEItemRarity::Legendary;
		if (R.Contains(TEXT("EPIC")))      return EKBVEItemRarity::Epic;
		if (R.Contains(TEXT("RARE")))      return EKBVEItemRarity::Rare;
		if (R.Contains(TEXT("UNCOMMON")))  return EKBVEItemRarity::Uncommon;
		return EKBVEItemRarity::Common;
	}

	FORCEINLINE FKBVEItemDef FromGen(const FKBVEGenItem& G)
	{
		FKBVEItemDef Def;
		Def.Key         = G.Key;
		Def.Ref         = FName(*G.Ref);
		Def.Name        = G.Name;
		Def.Description = G.Description;
		Def.Emoji       = G.Emoji;
		Def.bHasImg     = G.HasImg;
		Def.TypeFlags   = G.TypeFlags;
		Def.Rarity      = ParseRarity(G.Rarity);
		Def.MaxStack    = G.MaxStack > 0 ? G.MaxStack : 1;
		Def.bStackable  = G.Stackable;
		Def.BuyPrice    = G.BuyPrice;
		Def.SellPrice   = G.SellPrice;
		Def.Weight      = G.Weight;
		Def.bConsumable = G.Consumable;
		Def.Cooldown    = static_cast<float>(G.Cooldown);
		Def.Action      = G.Action;
		if (!G.AnimationRef.IsEmpty()) Def.AnimationRef = FName(*G.AnimationRef);
		if (!G.SoundRef.IsEmpty())     Def.SoundRef     = FName(*G.SoundRef);

		for (const FString& Tag : G.Tags)
		{
			if (!Tag.IsEmpty()) Def.Tags.Add(FName(*Tag));
		}

		Def.Food.Heals            = static_cast<float>(G.Food.Heals);
		Def.Food.RestoreMana      = static_cast<float>(G.Food.RestoreMana);
		Def.Food.RestoreEnergy    = static_cast<float>(G.Food.RestoreEnergy);
		Def.Food.RegenPerSecond   = G.Food.RegenPerSecond;
		Def.Food.RegenDuration    = G.Food.RegenDuration;
		Def.Food.bPerishable      = G.Food.Perishable;
		Def.Food.ShelfLifeSeconds = G.Food.ShelfLifeSeconds;
		if (!G.Food.SpoilsIntoRef.IsEmpty()) Def.Food.SpoilsIntoRef = FName(*G.Food.SpoilsIntoRef);
		Def.ConsumeBuffDuration   = static_cast<float>(G.Food.Duration);

		for (const FKBVEGenUseEffect& Buff : G.Food.BuffEffects)
		{
			FString Kind = Buff.StatusEffect;
			if (Kind.IsEmpty()) Kind = Buff.EffectKindCustom;
			Kind.RemoveFromStart(TEXT("STATUS_EFFECT_"));
			if (Kind.IsEmpty()) continue;

			FKBVEConsumeStatus St;
			St.Kind     = FName(*Kind.ToLower());
			St.Stacks   = Buff.Stacks > 0 ? Buff.Stacks : 1;
			St.Duration = Buff.Turns > 0 ? static_cast<float>(Buff.Turns) : Def.ConsumeBuffDuration;
			Def.ConsumeStatuses.Add(St);
		}

		const bool bHasFood =
			Def.Food.Heals > 0.f || Def.Food.RestoreMana > 0.f ||
			Def.Food.RestoreEnergy > 0.f || Def.Food.RegenPerSecond > 0.f;
		Def.bHasFood    = bHasFood || Def.IsFood() || Def.IsDrink() || Def.IsPotion();
		Def.bConsumable = Def.bConsumable || Def.bHasFood;

		return Def;
	}
}
