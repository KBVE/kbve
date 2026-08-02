#pragma once

#include "CoreMinimal.h"
#include "KBVEProfessionTypes.h"
#include "Generated/KBVEProfessionDBProtoTypes.h"

namespace KBVEProfessionMap
{
	FORCEINLINE FName N(const FString& S)
	{
		return S.IsEmpty() ? FName(NAME_None) : FName(*S);
	}

	FORCEINLINE void NArray(const TArray<FString>& In, TArray<FName>& Out)
	{
		Out.Reset(In.Num());
		for (const FString& S : In)
		{
			if (!S.IsEmpty()) Out.Add(FName(*S));
		}
	}

	FORCEINLINE FKBVEProfessionResource FromGen(const FKBVEGenResourceAmount& G)
	{
		FKBVEProfessionResource R;
		R.ItemRef  = N(G.ItemRef);
		R.ItemName = G.ItemName;
		R.Quantity = G.Quantity > 0 ? G.Quantity : 1;
		R.Chance   = G.Chance > 0.f ? G.Chance : 1.f;
		return R;
	}

	FORCEINLINE FKBVEProfessionActionDef FromGen(const FKBVEGenProfession& P, const FKBVEGenProfessionAction& A)
	{
		FKBVEProfessionActionDef D;
		D.Ref             = N(A.Ref);
		D.ProfessionRef   = N(P.Ref);
		D.Name            = A.Name;
		D.Description     = A.Description;
		D.RequiredLevel   = A.RequiredLevel;
		D.XpReward        = A.XpReward;
		D.DurationMs      = A.DurationMs;
		D.Key             = A.Key;
		D.FacilityRef     = N(A.FacilityRef);
		D.ResourceNodeRef = N(A.ResourceNodeRef);
		NArray(A.ToolRefs, D.ToolRefs);
		for (const FKBVEGenResourceAmount& I : A.Inputs) D.Inputs.Add(FromGen(I));
		for (const FKBVEGenResourceAmount& O : A.Outputs) D.Outputs.Add(FromGen(O));
		return D;
	}

	FORCEINLINE FKBVEProfessionDef FromGen(const FKBVEGenProfession& G)
	{
		FKBVEProfessionDef P;
		P.Ref         = N(G.Ref);
		P.Key         = G.Key;
		P.Id          = G.Id;
		P.Name        = G.Name;
		P.Description = G.Description;
		P.Category    = G.Category;
		NArray(G.Tags, P.Tags);
		P.MaxLevel = G.MaxLevel;
		for (const FKBVEGenProfessionAction& A : G.Actions)
		{
			if (!A.Ref.IsEmpty()) P.ActionRefs.Add(N(A.Ref));
		}
		return P;
	}
}
