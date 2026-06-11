#pragma once

#include "CoreMinimal.h"
#include "KBVEQuestTypes.h"
#include "KBVEQuestEnums.h"
#include "Generated/KBVEQuestDBProtoTypes.h"

// Single DTO -> domain mapping: generated proto-mirror (FKBVEGenQuest) -> curated
// runtime def (FKBVEQuestDef). Shared by UKBVEQuestDatabase and any game-side
// loader so there is exactly one place that interprets quest data.

namespace KBVEQuestMap
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

	FORCEINLINE FKBVEQuestObjective FromGen(const FKBVEGenQuestObjective& G)
	{
		FKBVEQuestObjective O;
		O.Id             = N(G.Id);
		O.Description    = G.Description;
		O.Type           = KBVEQuestEnum::ParseObjectiveType(G.Type);
		NArray(G.TargetRefs, O.TargetRefs);
		O.RequiredAmount = G.RequiredAmount > 0 ? G.RequiredAmount : 1;
		O.bOptional      = G.Optional;
		O.bHidden        = G.Hidden;
		O.RevealTrigger  = N(G.RevealTrigger);
		O.Order          = G.Order;
		O.ZoneRef        = N(G.ZoneRef);
		return O;
	}

	FORCEINLINE FKBVEQuestItemReward FromGen(const FKBVEGenQuestItemReward& G)
	{
		FKBVEQuestItemReward R;
		R.ItemRef  = N(G.ItemRef);
		R.ItemName = G.ItemName;
		R.Amount   = G.Amount > 0 ? G.Amount : 1;
		return R;
	}

	FORCEINLINE FKBVEAchievementMeta FromGen(const FKBVEGenAchievementMeta& G)
	{
		FKBVEAchievementMeta A;
		A.ApiName        = N(G.ApiName);
		A.Name           = G.Name;
		A.Description    = G.Description;
		A.IconAchieved   = G.IconAchieved;
		A.IconUnachieved = G.IconUnachieved;
		A.GlobalPercent  = G.GlobalPercent;
		A.bHidden        = G.Hidden;
		A.MinValue       = G.MinValue;
		A.MaxValue       = G.MaxValue;
		return A;
	}

	FORCEINLINE FKBVEQuestRewards FromGen(const FKBVEGenQuestRewards& G)
	{
		FKBVEQuestRewards R;
		for (const FKBVEGenQuestItemReward& I : G.Items) R.Items.Add(FromGen(I));
		R.Currency = G.Currency;
		R.Xp       = G.Xp;
		for (const TPair<FString, double>& B : G.Bonuses)
		{
			if (!B.Key.IsEmpty()) R.Bonuses.Add(FName(*B.Key), static_cast<float>(B.Value));
		}
		R.Achievement       = FromGen(G.Achievement);
		R.bHasAchievement   = !R.Achievement.ApiName.IsNone();
		R.UnlockRef         = N(G.UnlockRef);
		NArray(G.UnlockQuestRefs, R.UnlockQuestRefs);
		R.ReputationAmount  = G.ReputationAmount;
		R.ReputationFaction = N(G.ReputationFaction);
		return R;
	}

	FORCEINLINE bool RewardsNonEmpty(const FKBVEQuestRewards& R)
	{
		return R.Currency != 0 || R.Xp != 0 || R.Items.Num() > 0 ||
			R.Bonuses.Num() > 0 || R.bHasAchievement || !R.UnlockRef.IsNone() ||
			R.UnlockQuestRefs.Num() > 0 || R.ReputationAmount != 0;
	}

	FORCEINLINE FKBVEQuestChoice FromGen(const FKBVEGenQuestChoice& G)
	{
		FKBVEQuestChoice C;
		C.Id               = N(G.Id);
		C.Label            = G.Label;
		C.Description      = G.Description;
		C.Consequence      = KBVEQuestEnum::ParseConsequence(G.Consequence);
		C.ConsequenceRef   = N(G.ConsequenceRef);
		C.ConsequenceValue = G.ConsequenceValue;
		C.NextStepId       = N(G.NextStepId);
		NArray(G.RequiredItemRefs, C.RequiredItemRefs);
		C.RequiredClass    = N(G.RequiredClass);
		C.OutcomeId        = N(G.OutcomeId);
		NArray(G.SetFlags, C.SetFlags);
		C.DialogueNodeRef  = N(G.DialogueNodeRef);
		return C;
	}

	FORCEINLINE FKBVEQuestOutcome FromGen(const FKBVEGenQuestOutcome& G)
	{
		FKBVEQuestOutcome O;
		O.Id          = N(G.Id);
		O.Description  = G.Description;
		O.Rewards      = FromGen(G.Rewards);
		O.NextQuestRef = N(G.NextQuestRef);
		NArray(G.ConsequenceFlags, O.ConsequenceFlags);
		O.EndingType   = N(G.EndingType);
		O.bCanonical   = G.Canonical;
		return O;
	}

	FORCEINLINE FKBVEQuestDialogueHooks FromGen(const FKBVEGenQuestDialogueHooks& G)
	{
		FKBVEQuestDialogueHooks H;
		H.AcceptRef     = N(G.AcceptRef);
		H.InProgressRef = N(G.InProgressRef);
		H.CompleteRef   = N(G.CompleteRef);
		H.TurnInRef     = N(G.TurnInRef);
		H.FailRef       = N(G.FailRef);
		H.AbandonRef    = N(G.AbandonRef);
		return H;
	}

	FORCEINLINE FKBVEQuestStep FromGen(const FKBVEGenQuestStep& G)
	{
		FKBVEQuestStep S;
		S.Id          = N(G.Id);
		S.Title       = G.Title;
		S.Description  = G.Description;
		S.SpeakerRef   = N(G.SpeakerRef);
		for (const FKBVEGenQuestObjective& O : G.Objectives) S.Objectives.Add(FromGen(O));
		for (const FKBVEGenQuestChoice& C : G.Choices) S.Choices.Add(FromGen(C));
		S.NextStepId      = N(G.NextStepId);
		S.StepRewards     = FromGen(G.StepRewards);
		S.bHasStepRewards = RewardsNonEmpty(S.StepRewards);
		S.TriggerOnStart    = N(G.TriggerOnStart);
		S.TriggerOnComplete = N(G.TriggerOnComplete);
		S.bParallel       = G.Parallel;
		S.bAutoComplete   = G.AutoComplete;
		S.bHidden         = G.Hidden;
		S.bSkippable      = G.Skippable;
		S.FailurePolicy   = KBVEQuestEnum::ParseFailurePolicy(G.FailurePolicy);
		S.StepTimeLimitSecs = G.StepTimeLimitSecs;
		S.DialogueHooks   = FromGen(G.DialogueHooks);
		return S;
	}

	FORCEINLINE FKBVEQuestPrerequisite FromGen(const FKBVEGenQuestPrerequisite& G)
	{
		FKBVEQuestPrerequisite P;
		P.LevelRequirement = G.LevelRequirement;
		NArray(G.QuestRefs, P.QuestRefs);
		P.FactionRef  = N(G.FactionRef);
		P.FactionRank = G.FactionRank;
		NArray(G.ItemRefs, P.ItemRefs);
		P.ClassRef    = N(G.ClassRef);
		P.Trigger     = N(G.Trigger);
		P.InnTierMin  = static_cast<int32>(G.InnTierMin);
		return P;
	}

	FORCEINLINE FKBVEQuestTimeLimits FromGen(const FKBVEGenQuestTimeLimits& G)
	{
		FKBVEQuestTimeLimits T;
		T.TimeLimitSecs  = G.TimeLimitSecs;
		T.AvailableAfter = G.AvailableAfter;
		T.AvailableUntil = G.AvailableUntil;
		T.CooldownSecs   = G.CooldownSecs;
		T.DailyResetHour = G.DailyResetHour;
		return T;
	}

	FORCEINLINE FKBVERepeatRewards FromGen(const FKBVEGenRepeatRewards& G)
	{
		FKBVERepeatRewards R;
		R.FirstTime = FromGen(G.FirstTime);
		R.Repeat    = FromGen(G.Repeat);
		return R;
	}

	FORCEINLINE FKBVEQuestExtension FromGen(const FKBVEGenQuestExtension& G)
	{
		FKBVEQuestExtension E;
		E.Key         = N(G.Key);
		E.StringValue = G.StringValue;
		E.IntValue    = G.IntValue;
		E.FloatValue  = G.FloatValue;
		E.BoolValue   = G.BoolValue;
		return E;
	}

	FORCEINLINE FKBVEQuestDef FromGen(const FKBVEGenQuest& G)
	{
		FKBVEQuestDef Q;
		Q.Id          = G.Id;
		Q.Ref         = N(G.Ref);
		Q.Title       = G.Title;
		Q.Description = G.Description;
		Q.Lore        = G.Lore;
		Q.Category    = KBVEQuestEnum::ParseCategory(G.Category);
		NArray(G.Tags, Q.Tags);
		Q.Icon        = G.Icon;
		Q.Img         = G.Img;
		Q.MarkerIcon  = G.MarkerIcon;
		Q.Prerequisites = FromGen(G.Prerequisites);
		Q.bHidden       = G.Hidden;
		Q.bRepeatable   = G.Repeatable;
		Q.bAutoAccept   = G.AutoAccept;
		Q.bAutoComplete = G.AutoComplete;
		Q.bShareable    = G.Shareable;
		Q.bAbandonable  = G.Abandonable;
		Q.bTracked      = G.Tracked;
		Q.TimeLimits    = FromGen(G.TimeLimits);
		for (const FKBVEGenQuestStep& S : G.Steps) Q.Steps.Add(FromGen(S));
		Q.NextQuestRef  = N(G.NextQuestRef);
		Q.ChainRef      = N(G.ChainRef);
		NArray(G.GiverNpcRefs, Q.GiverNpcRefs);
		NArray(G.TurnInNpcRefs, Q.TurnInNpcRefs);
		NArray(G.ZoneRefs, Q.ZoneRefs);
		Q.RecommendedLevel     = G.RecommendedLevel;
		Q.RecommendedPartySize = G.RecommendedPartySize;
		Q.Rewards       = FromGen(G.Rewards);
		for (const FKBVEGenQuestOutcome& O : G.Outcomes) Q.Outcomes.Add(FromGen(O));
		Q.RepeatRewards    = FromGen(G.RepeatRewards);
		Q.bHasRepeatRewards = RewardsNonEmpty(Q.RepeatRewards.FirstTime) || RewardsNonEmpty(Q.RepeatRewards.Repeat);
		Q.RewardPolicy  = KBVEQuestEnum::ParseRewardPolicy(G.RewardPolicy);
		Q.FailurePolicy = KBVEQuestEnum::ParseFailurePolicy(G.FailurePolicy);
		Q.DialogueHooks = FromGen(G.DialogueHooks);
		NArray(G.Triggers, Q.Triggers);
		NArray(G.RequiredFlags, Q.RequiredFlags);
		NArray(G.BlockedByFlags, Q.BlockedByFlags);
		for (const FKBVEGenQuestExtension& E : G.Extensions) Q.Extensions.Add(FromGen(E));
		Q.Credits = G.Credits;
		// Flattened single-step `objectives` (MDX convenience, not in proto Quest)
		// are filled by the loader from the raw JSON; see UKBVEQuestDatabase.
		return Q;
	}

	FORCEINLINE FKBVEQuestChainDef FromGen(const FKBVEGenQuestChain& G)
	{
		FKBVEQuestChainDef C;
		C.Id          = G.Id;
		C.Ref         = N(G.Ref);
		C.Name        = G.Name;
		C.Description  = G.Description;
		NArray(G.QuestRefs, C.QuestRefs);
		C.Icon         = G.Icon;
		C.ChainRewards = FromGen(G.ChainRewards);
		return C;
	}
}
