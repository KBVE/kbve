#pragma once

#include "CoreMinimal.h"
#include "KBVEQuestEnums.h"
#include "KBVEQuestTypes.generated.h"

USTRUCT(BlueprintType)
struct FKBVEQuestObjective
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	EKBVEObjectiveType Type = EKBVEObjectiveType::Collect;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> TargetRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 RequiredAmount = 1;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bOptional = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHidden = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName RevealTrigger;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Order = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ZoneRef;
};

USTRUCT(BlueprintType)
struct FKBVEQuestItemReward
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ItemRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString ItemName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Amount = 1;
};

USTRUCT(BlueprintType)
struct FKBVEAchievementMeta
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ApiName;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString IconAchieved;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString IconUnachieved;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	float GlobalPercent = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHidden = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 MinValue = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 MaxValue = 0;
};

USTRUCT(BlueprintType)
struct FKBVEQuestRewards
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestItemReward> Items;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Currency = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 Xp = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TMap<FName, float> Bonuses;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEAchievementMeta Achievement;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHasAchievement = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName UnlockRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> UnlockQuestRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 ReputationAmount = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ReputationFaction;
};

USTRUCT(BlueprintType)
struct FKBVEQuestChoice
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Label;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	EKBVEChoiceConsequence Consequence = EKBVEChoiceConsequence::None;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ConsequenceRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 ConsequenceValue = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName NextStepId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> RequiredItemRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName RequiredClass;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName OutcomeId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> SetFlags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName DialogueNodeRef;
};

USTRUCT(BlueprintType)
struct FKBVEQuestOutcome
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards Rewards;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName NextQuestRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> ConsequenceFlags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName EndingType;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bCanonical = false;
};

USTRUCT(BlueprintType)
struct FKBVEQuestDialogueHooks
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName AcceptRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName InProgressRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName CompleteRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName TurnInRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName FailRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName AbandonRef;
};

USTRUCT(BlueprintType)
struct FKBVEQuestStep
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName SpeakerRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestObjective> Objectives;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestChoice> Choices;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName NextStepId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards StepRewards;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHasStepRewards = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName TriggerOnStart;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName TriggerOnComplete;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bParallel = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bAutoComplete = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHidden = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bSkippable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	EKBVEFailurePolicy FailurePolicy = EKBVEFailurePolicy::Permanent;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 StepTimeLimitSecs = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestDialogueHooks DialogueHooks;
};

USTRUCT(BlueprintType)
struct FKBVEQuestPrerequisite
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 LevelRequirement = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> QuestRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName FactionRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 FactionRank = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> ItemRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ClassRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Trigger;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 InnTierMin = 0;
};

USTRUCT(BlueprintType)
struct FKBVEQuestTimeLimits
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 TimeLimitSecs = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString AvailableAfter;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString AvailableUntil;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 CooldownSecs = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 DailyResetHour = 0;
};

USTRUCT(BlueprintType)
struct FKBVERepeatRewards
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards FirstTime;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards Repeat;
};

USTRUCT(BlueprintType)
struct FKBVEQuestExtension
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Key;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString StringValue;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int64 IntValue = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	double FloatValue = 0.0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool BoolValue = false;
};

USTRUCT(BlueprintType)
struct FKBVEQuestDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Lore;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	EKBVEQuestCategory Category = EKBVEQuestCategory::Main;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> Tags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Icon;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Img;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString MarkerIcon;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestPrerequisite Prerequisites;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHidden = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bRepeatable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bAutoAccept = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bAutoComplete = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bShareable = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bAbandonable = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bTracked = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestTimeLimits TimeLimits;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestStep> Steps;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestObjective> Objectives;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName NextQuestRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName ChainRef;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> GiverNpcRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> TurnInNpcRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> ZoneRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 RecommendedLevel = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	int32 RecommendedPartySize = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards Rewards;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestOutcome> Outcomes;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVERepeatRewards RepeatRewards;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	bool bHasRepeatRewards = false;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	EKBVERewardPolicy RewardPolicy = EKBVERewardPolicy::Individual;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	EKBVEFailurePolicy FailurePolicy = EKBVEFailurePolicy::Permanent;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestDialogueHooks DialogueHooks;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> Triggers;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> RequiredFlags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> BlockedByFlags;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FKBVEQuestExtension> Extensions;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Credits;

	bool IsValid() const { return !Ref.IsNone(); }

	int32 CountRequiredObjectives() const
	{
		int32 Total = 0;
		for (const FKBVEQuestObjective& O : Objectives)
		{
			if (!O.bOptional) ++Total;
		}
		for (const FKBVEQuestStep& S : Steps)
		{
			for (const FKBVEQuestObjective& O : S.Objectives)
			{
				if (!O.bOptional) ++Total;
			}
		}
		return Total;
	}
};

USTRUCT(BlueprintType)
struct FKBVEQuestChainDef
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Id;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FName Ref;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Name;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Description;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	TArray<FName> QuestRefs;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FString Icon;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Quest")
	FKBVEQuestRewards ChainRewards;
};
