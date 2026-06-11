#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEQuestTypes.h"
#include "KBVEQuestProgress.generated.h"

class UKBVEQuestDatabase;

USTRUCT(BlueprintType)
struct FKBVEObjectiveProgress
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	FName ObjectiveId;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	int32 Current = 0;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	int32 Required = 1;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	bool bOptional = false;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	bool bComplete = false;
};

USTRUCT(BlueprintType)
struct FKBVEActiveQuest
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	FName QuestRef;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	EKBVEQuestStatus Status = EKBVEQuestStatus::Active;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	FName CurrentStepId;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	TArray<FKBVEObjectiveProgress> Objectives;

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Quest")
	int32 CompletionCount = 0;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKBVEOnQuestStatusChanged, FName, QuestRef, EKBVEQuestStatus, Status);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FKBVEOnObjectiveUpdated, FName, QuestRef, FName, ObjectiveId, int32, Current);

UCLASS()
class KBVEQUESTDB_API UKBVEQuestProgressSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Quest")
	FKBVEOnQuestStatusChanged OnQuestStatusChanged;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Quest")
	FKBVEOnObjectiveUpdated OnObjectiveUpdated;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool AcceptQuest(FName QuestRef);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool AdvanceObjective(FName QuestRef, FName ObjectiveId, int32 Amount = 1);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool AdvanceStep(FName QuestRef);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool TurnInQuest(FName QuestRef);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool AbandonQuest(FName QuestRef);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool FailQuest(FName QuestRef);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool IsActive(FName QuestRef) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool IsCompleted(FName QuestRef) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	EKBVEQuestStatus GetStatus(FName QuestRef) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool GetActiveQuest(FName QuestRef, FKBVEActiveQuest& OutQuest) const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	TArray<FKBVEActiveQuest> GetActiveQuests() const;

	UFUNCTION(BlueprintCallable, Category = "KBVE|Quest")
	bool ArePrerequisitesMet(FName QuestRef, int32 PlayerLevel) const;

private:
	UKBVEQuestDatabase* GetDatabase() const;

	void BuildStepObjectives(const FKBVEQuestDef& Def, FName StepId, FKBVEActiveQuest& Active) const;
	bool AreRequiredObjectivesComplete(const FKBVEActiveQuest& Active) const;
	void SetStatus(FKBVEActiveQuest& Active, EKBVEQuestStatus NewStatus);

	UPROPERTY()
	TMap<FName, FKBVEActiveQuest> ActiveQuests;

	UPROPERTY()
	TSet<FName> CompletedQuests;

	TMap<FName, int32> CompletionCounts;

	UPROPERTY()
	TWeakObjectPtr<UKBVEQuestDatabase> CachedDatabase;
};
