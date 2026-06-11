#include "KBVEQuestProgress.h"

#include "KBVEQuestDatabase.h"
#include "Engine/GameInstance.h"

void UKBVEQuestProgressSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Collection.InitializeDependency(UKBVEQuestDatabase::StaticClass());
}

void UKBVEQuestProgressSubsystem::Deinitialize()
{
	ActiveQuests.Reset();
	CompletedQuests.Reset();
	CompletionCounts.Reset();
	CachedDatabase.Reset();
	Super::Deinitialize();
}

UKBVEQuestDatabase* UKBVEQuestProgressSubsystem::GetDatabase() const
{
	if (CachedDatabase.IsValid())
	{
		return CachedDatabase.Get();
	}
	if (UGameInstance* GI = GetGameInstance())
	{
		UKBVEQuestProgressSubsystem* MutableThis = const_cast<UKBVEQuestProgressSubsystem*>(this);
		MutableThis->CachedDatabase = GI->GetSubsystem<UKBVEQuestDatabase>();
		return CachedDatabase.Get();
	}
	return nullptr;
}

void UKBVEQuestProgressSubsystem::BuildStepObjectives(const FKBVEQuestDef& Def, FName StepId, FKBVEActiveQuest& Active) const
{
	Active.Objectives.Reset();

	const TArray<FKBVEQuestObjective>* Source = nullptr;
	if (Def.Steps.Num() > 0)
	{
		const FKBVEQuestStep* Step = StepId.IsNone()
			? &Def.Steps[0]
			: Def.Steps.FindByPredicate([StepId](const FKBVEQuestStep& S) { return S.Id == StepId; });
		if (Step)
		{
			Active.CurrentStepId = Step->Id;
			Source = &Step->Objectives;
		}
	}
	else
	{
		Active.CurrentStepId = NAME_None;
		Source = &Def.Objectives;
	}

	if (!Source) return;

	for (const FKBVEQuestObjective& O : *Source)
	{
		FKBVEObjectiveProgress P;
		P.ObjectiveId = O.Id;
		P.Required    = O.RequiredAmount > 0 ? O.RequiredAmount : 1;
		P.bOptional   = O.bOptional;
		P.bComplete   = false;
		Active.Objectives.Add(P);
	}
}

bool UKBVEQuestProgressSubsystem::AreRequiredObjectivesComplete(const FKBVEActiveQuest& Active) const
{
	for (const FKBVEObjectiveProgress& P : Active.Objectives)
	{
		if (!P.bOptional && !P.bComplete) return false;
	}
	return true;
}

void UKBVEQuestProgressSubsystem::SetStatus(FKBVEActiveQuest& Active, EKBVEQuestStatus NewStatus)
{
	if (Active.Status == NewStatus) return;
	Active.Status = NewStatus;
	OnQuestStatusChanged.Broadcast(Active.QuestRef, NewStatus);
}

bool UKBVEQuestProgressSubsystem::AcceptQuest(FName QuestRef)
{
	if (ActiveQuests.Contains(QuestRef)) return false;

	UKBVEQuestDatabase* Db = GetDatabase();
	if (!Db) return false;

	const FKBVEQuestDef* Def = Db->FindByRef(QuestRef);
	if (!Def) return false;

	if (CompletedQuests.Contains(QuestRef) && !Def->bRepeatable) return false;

	FKBVEActiveQuest Active;
	Active.QuestRef        = QuestRef;
	Active.Status          = EKBVEQuestStatus::Active;
	Active.CompletionCount = CompletionCounts.FindRef(QuestRef);
	BuildStepObjectives(*Def, NAME_None, Active);

	FKBVEActiveQuest& Stored = ActiveQuests.Add(QuestRef, MoveTemp(Active));
	OnQuestStatusChanged.Broadcast(QuestRef, EKBVEQuestStatus::Active);

	// A quest with no objectives is immediately complete.
	if (AreRequiredObjectivesComplete(Stored))
	{
		SetStatus(Stored, EKBVEQuestStatus::Complete);
	}
	return true;
}

bool UKBVEQuestProgressSubsystem::AdvanceObjective(FName QuestRef, FName ObjectiveId, int32 Amount)
{
	FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef);
	if (!Active || Active->Status != EKBVEQuestStatus::Active) return false;

	FKBVEObjectiveProgress* Progress = Active->Objectives.FindByPredicate(
		[ObjectiveId](const FKBVEObjectiveProgress& P) { return P.ObjectiveId == ObjectiveId; });
	if (!Progress || Progress->bComplete) return false;

	Progress->Current = FMath::Clamp(Progress->Current + Amount, 0, Progress->Required);
	Progress->bComplete = Progress->Current >= Progress->Required;
	OnObjectiveUpdated.Broadcast(QuestRef, ObjectiveId, Progress->Current);

	if (AreRequiredObjectivesComplete(*Active))
	{
		UKBVEQuestDatabase* Db = GetDatabase();
		const FKBVEQuestDef* Def = Db ? Db->FindByRef(QuestRef) : nullptr;
		const bool bHasNextStep = Def && !Active->CurrentStepId.IsNone();
		const FKBVEQuestStep* CurStep = bHasNextStep
			? Def->Steps.FindByPredicate([&](const FKBVEQuestStep& S) { return S.Id == Active->CurrentStepId; })
			: nullptr;

		if (CurStep && CurStep->bAutoComplete && !CurStep->NextStepId.IsNone())
		{
			AdvanceStep(QuestRef);
		}
		else
		{
			SetStatus(*Active, EKBVEQuestStatus::Complete);
		}
	}
	return true;
}

bool UKBVEQuestProgressSubsystem::AdvanceStep(FName QuestRef)
{
	FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef);
	if (!Active) return false;

	UKBVEQuestDatabase* Db = GetDatabase();
	const FKBVEQuestDef* Def = Db ? Db->FindByRef(QuestRef) : nullptr;
	if (!Def || Def->Steps.Num() == 0) return false;

	const FKBVEQuestStep* CurStep = Def->Steps.FindByPredicate(
		[&](const FKBVEQuestStep& S) { return S.Id == Active->CurrentStepId; });
	if (!CurStep || CurStep->NextStepId.IsNone())
	{
		SetStatus(*Active, EKBVEQuestStatus::Complete);
		return true;
	}

	BuildStepObjectives(*Def, CurStep->NextStepId, *Active);
	SetStatus(*Active, EKBVEQuestStatus::Active);

	if (AreRequiredObjectivesComplete(*Active))
	{
		SetStatus(*Active, EKBVEQuestStatus::Complete);
	}
	return true;
}

bool UKBVEQuestProgressSubsystem::TurnInQuest(FName QuestRef)
{
	FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef);
	if (!Active || Active->Status != EKBVEQuestStatus::Complete) return false;

	SetStatus(*Active, EKBVEQuestStatus::TurnedIn);
	CompletedQuests.Add(QuestRef);
	CompletionCounts.FindOrAdd(QuestRef) += 1;
	ActiveQuests.Remove(QuestRef);
	return true;
}

bool UKBVEQuestProgressSubsystem::AbandonQuest(FName QuestRef)
{
	FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef);
	if (!Active) return false;

	UKBVEQuestDatabase* Db = GetDatabase();
	const FKBVEQuestDef* Def = Db ? Db->FindByRef(QuestRef) : nullptr;
	if (Def && !Def->bAbandonable) return false;

	SetStatus(*Active, EKBVEQuestStatus::Abandoned);
	ActiveQuests.Remove(QuestRef);
	return true;
}

bool UKBVEQuestProgressSubsystem::FailQuest(FName QuestRef)
{
	FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef);
	if (!Active) return false;

	SetStatus(*Active, EKBVEQuestStatus::Failed);
	ActiveQuests.Remove(QuestRef);
	return true;
}

bool UKBVEQuestProgressSubsystem::IsActive(FName QuestRef) const
{
	return ActiveQuests.Contains(QuestRef);
}

bool UKBVEQuestProgressSubsystem::IsCompleted(FName QuestRef) const
{
	return CompletedQuests.Contains(QuestRef);
}

EKBVEQuestStatus UKBVEQuestProgressSubsystem::GetStatus(FName QuestRef) const
{
	if (const FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef))
	{
		return Active->Status;
	}
	if (CompletedQuests.Contains(QuestRef))
	{
		return EKBVEQuestStatus::TurnedIn;
	}
	return EKBVEQuestStatus::Locked;
}

bool UKBVEQuestProgressSubsystem::GetActiveQuest(FName QuestRef, FKBVEActiveQuest& OutQuest) const
{
	if (const FKBVEActiveQuest* Active = ActiveQuests.Find(QuestRef))
	{
		OutQuest = *Active;
		return true;
	}
	return false;
}

TArray<FKBVEActiveQuest> UKBVEQuestProgressSubsystem::GetActiveQuests() const
{
	TArray<FKBVEActiveQuest> Out;
	ActiveQuests.GenerateValueArray(Out);
	return Out;
}

bool UKBVEQuestProgressSubsystem::ArePrerequisitesMet(FName QuestRef, int32 PlayerLevel) const
{
	UKBVEQuestDatabase* Db = GetDatabase();
	const FKBVEQuestDef* Def = Db ? Db->FindByRef(QuestRef) : nullptr;
	if (!Def) return false;

	const FKBVEQuestPrerequisite& Pre = Def->Prerequisites;
	if (PlayerLevel < Pre.LevelRequirement) return false;

	for (const FName& Req : Pre.QuestRefs)
	{
		if (!CompletedQuests.Contains(Req)) return false;
	}
	return true;
}
