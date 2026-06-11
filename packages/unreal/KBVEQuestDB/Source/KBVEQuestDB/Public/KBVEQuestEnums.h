#pragma once

#include "CoreMinimal.h"
#include "KBVEQuestEnums.generated.h"

UENUM(BlueprintType)
enum class EKBVEQuestCategory : uint8
{
	Main      UMETA(DisplayName = "Main"),
	Side      UMETA(DisplayName = "Side"),
	Daily     UMETA(DisplayName = "Daily"),
	Event     UMETA(DisplayName = "Event"),
	Challenge UMETA(DisplayName = "Challenge"),
	Tutorial  UMETA(DisplayName = "Tutorial"),
	Bounty    UMETA(DisplayName = "Bounty"),
	Guild     UMETA(DisplayName = "Guild")
};

UENUM(BlueprintType)
enum class EKBVEObjectiveType : uint8
{
	Collect  UMETA(DisplayName = "Collect"),
	Kill     UMETA(DisplayName = "Kill"),
	Visit    UMETA(DisplayName = "Visit"),
	Interact UMETA(DisplayName = "Interact"),
	Escort   UMETA(DisplayName = "Escort"),
	Defend   UMETA(DisplayName = "Defend"),
	Craft    UMETA(DisplayName = "Craft"),
	Explore  UMETA(DisplayName = "Explore"),
	Custom   UMETA(DisplayName = "Custom")
};

UENUM(BlueprintType)
enum class EKBVEChoiceConsequence : uint8
{
	None           UMETA(DisplayName = "None"),
	AdvanceQuest   UMETA(DisplayName = "Advance Quest"),
	FailQuest      UMETA(DisplayName = "Fail Quest"),
	BranchQuest    UMETA(DisplayName = "Branch Quest"),
	GiveItem       UMETA(DisplayName = "Give Item"),
	TakeItem       UMETA(DisplayName = "Take Item"),
	Reputation     UMETA(DisplayName = "Reputation"),
	SpawnEnemy     UMETA(DisplayName = "Spawn Enemy"),
	Teleport       UMETA(DisplayName = "Teleport"),
	Unlock         UMETA(DisplayName = "Unlock"),
	SetFlag        UMETA(DisplayName = "Set Flag"),
	ClearFlag      UMETA(DisplayName = "Clear Flag"),
	NpcDisposition UMETA(DisplayName = "NPC Disposition")
};

UENUM(BlueprintType)
enum class EKBVEFailurePolicy : uint8
{
	Permanent   UMETA(DisplayName = "Permanent"),
	RetryStep   UMETA(DisplayName = "Retry Step"),
	RetryQuest  UMETA(DisplayName = "Retry Quest"),
	SoftFail    UMETA(DisplayName = "Soft Fail")
};

UENUM(BlueprintType)
enum class EKBVERewardPolicy : uint8
{
	Individual UMETA(DisplayName = "Individual"),
	Shared     UMETA(DisplayName = "Shared"),
	Leader     UMETA(DisplayName = "Leader")
};

UENUM(BlueprintType)
enum class EKBVEQuestStatus : uint8
{
	Locked    UMETA(DisplayName = "Locked"),
	Available UMETA(DisplayName = "Available"),
	Active    UMETA(DisplayName = "Active"),
	Complete  UMETA(DisplayName = "Complete"),
	TurnedIn  UMETA(DisplayName = "Turned In"),
	Failed    UMETA(DisplayName = "Failed"),
	Abandoned UMETA(DisplayName = "Abandoned")
};

namespace KBVEQuestEnum
{
	FORCEINLINE EKBVEQuestCategory ParseCategory(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.EndsWith(TEXT("SIDE")))      return EKBVEQuestCategory::Side;
		if (R.EndsWith(TEXT("DAILY")))     return EKBVEQuestCategory::Daily;
		if (R.EndsWith(TEXT("EVENT")))     return EKBVEQuestCategory::Event;
		if (R.EndsWith(TEXT("CHALLENGE"))) return EKBVEQuestCategory::Challenge;
		if (R.EndsWith(TEXT("TUTORIAL")))  return EKBVEQuestCategory::Tutorial;
		if (R.EndsWith(TEXT("BOUNTY")))    return EKBVEQuestCategory::Bounty;
		if (R.EndsWith(TEXT("GUILD")))     return EKBVEQuestCategory::Guild;
		return EKBVEQuestCategory::Main;
	}

	FORCEINLINE EKBVEObjectiveType ParseObjectiveType(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.EndsWith(TEXT("KILL")))     return EKBVEObjectiveType::Kill;
		if (R.EndsWith(TEXT("VISIT")))    return EKBVEObjectiveType::Visit;
		if (R.EndsWith(TEXT("INTERACT"))) return EKBVEObjectiveType::Interact;
		if (R.EndsWith(TEXT("ESCORT")))   return EKBVEObjectiveType::Escort;
		if (R.EndsWith(TEXT("DEFEND")))   return EKBVEObjectiveType::Defend;
		if (R.EndsWith(TEXT("CRAFT")))    return EKBVEObjectiveType::Craft;
		if (R.EndsWith(TEXT("EXPLORE")))  return EKBVEObjectiveType::Explore;
		if (R.EndsWith(TEXT("CUSTOM")))   return EKBVEObjectiveType::Custom;
		return EKBVEObjectiveType::Collect;
	}

	FORCEINLINE EKBVEChoiceConsequence ParseConsequence(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.EndsWith(TEXT("ADVANCE_QUEST")))    return EKBVEChoiceConsequence::AdvanceQuest;
		if (R.EndsWith(TEXT("FAIL_QUEST")))       return EKBVEChoiceConsequence::FailQuest;
		if (R.EndsWith(TEXT("BRANCH_QUEST")))     return EKBVEChoiceConsequence::BranchQuest;
		if (R.EndsWith(TEXT("GIVE_ITEM")))        return EKBVEChoiceConsequence::GiveItem;
		if (R.EndsWith(TEXT("TAKE_ITEM")))        return EKBVEChoiceConsequence::TakeItem;
		if (R.EndsWith(TEXT("REPUTATION")))       return EKBVEChoiceConsequence::Reputation;
		if (R.EndsWith(TEXT("SPAWN_ENEMY")))      return EKBVEChoiceConsequence::SpawnEnemy;
		if (R.EndsWith(TEXT("TELEPORT")))         return EKBVEChoiceConsequence::Teleport;
		if (R.EndsWith(TEXT("UNLOCK")))           return EKBVEChoiceConsequence::Unlock;
		if (R.EndsWith(TEXT("SET_FLAG")))         return EKBVEChoiceConsequence::SetFlag;
		if (R.EndsWith(TEXT("CLEAR_FLAG")))       return EKBVEChoiceConsequence::ClearFlag;
		if (R.EndsWith(TEXT("NPC_DISPOSITION")))  return EKBVEChoiceConsequence::NpcDisposition;
		return EKBVEChoiceConsequence::None;
	}

	FORCEINLINE EKBVEFailurePolicy ParseFailurePolicy(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.EndsWith(TEXT("RETRY_STEP")))  return EKBVEFailurePolicy::RetryStep;
		if (R.EndsWith(TEXT("RETRY_QUEST"))) return EKBVEFailurePolicy::RetryQuest;
		if (R.EndsWith(TEXT("SOFT_FAIL")))   return EKBVEFailurePolicy::SoftFail;
		return EKBVEFailurePolicy::Permanent;
	}

	FORCEINLINE EKBVERewardPolicy ParseRewardPolicy(const FString& Raw)
	{
		const FString R = Raw.ToUpper();
		if (R.EndsWith(TEXT("SHARED"))) return EKBVERewardPolicy::Shared;
		if (R.EndsWith(TEXT("LEADER"))) return EKBVERewardPolicy::Leader;
		return EKBVERewardPolicy::Individual;
	}
}
