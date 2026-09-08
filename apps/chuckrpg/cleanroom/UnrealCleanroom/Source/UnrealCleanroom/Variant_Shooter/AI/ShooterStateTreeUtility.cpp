// Copyright Epic Games, Inc. All Rights Reserved.


#include "Variant_Shooter/AI/ShooterStateTreeUtility.h"
#include "StateTreeExecutionContext.h"
#include "ShooterNPC.h"
#include "Camera/CameraComponent.h"
#include "AIController.h"
#include "Perception/AIPerceptionComponent.h"
#include "ShooterAIController.h"
#include "StateTreeAsyncExecutionContext.h"

bool FStateTreeLineOfSightToTargetCondition::TestCondition(FStateTreeExecutionContext& Context) const
{
	const FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// ensure the target is valid
	if (!IsValid(InstanceData.Target))
	{
		return !InstanceData.bMustHaveLineOfSight;
	}
	
	// check if the character is facing towards the target
	const FVector TargetDir = (InstanceData.Target->GetActorLocation() - InstanceData.Character->GetActorLocation()).GetSafeNormal();

	const float FacingDot = FVector::DotProduct(TargetDir, InstanceData.Character->GetActorForwardVector());
	const float MaxDot = FMath::Cos(FMath::DegreesToRadians(InstanceData.LineOfSightConeAngle));

	// is the facing outside of our cone half angle?
	if (FacingDot <= MaxDot)
	{
		return !InstanceData.bMustHaveLineOfSight;
	}

	// get the target's bounding box
	FVector CenterOfMass, Extent;
	InstanceData.Target->GetActorBounds(true, CenterOfMass, Extent, false);

	// divide the vertical extent by the number of line of sight checks we'll do
	const float ExtentZOffset = Extent.Z * 2.0f / InstanceData.NumberOfVerticalLineOfSightChecks;

	// get the character's camera location as the source for the line checks
	const FVector Start = InstanceData.Character->GetFirstPersonCameraComponent()->GetComponentLocation();

	// ignore the character and target. We want to ensure there's an unobstructed trace not counting them
	FCollisionQueryParams QueryParams;
	QueryParams.AddIgnoredActor(InstanceData.Character);
	QueryParams.AddIgnoredActor(InstanceData.Target);

	FHitResult OutHit;

	// run a number of vertically offset line traces to the target location
	for (int32 i = 0; i < InstanceData.NumberOfVerticalLineOfSightChecks - 1; ++i)
	{
		// calculate the endpoint for the trace
		const FVector End = CenterOfMass + FVector(0.0f, 0.0f, Extent.Z - ExtentZOffset * i);

		InstanceData.Character->GetWorld()->LineTraceSingleByChannel(OutHit, Start, End, ECC_Visibility, QueryParams);

		// is the trace unobstructed?
		if (!OutHit.bBlockingHit)
		{
			// we only need one unobstructed trace, so terminate early
			return InstanceData.bMustHaveLineOfSight;
		}
	}

	// no line of sight found
	return !InstanceData.bMustHaveLineOfSight;
}

#if WITH_EDITOR
FText FStateTreeLineOfSightToTargetCondition::GetDescription(const FGuid& ID, FStateTreeDataView InstanceDataView, const IStateTreeBindingLookup& BindingLookup, EStateTreeNodeFormatting Formatting /*= EStateTreeNodeFormatting::Text*/) const
{
	return FText::FromString("<b>Has Line of Sight</b>");
}
#endif

////////////////////////////////////////////////////////////////////

EStateTreeRunStatus FStateTreeFaceActorTask::EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// set the AI Controller's focus
	InstanceData.Controller->SetFocus(InstanceData.ActorToFaceTowards);

	return EStateTreeRunStatus::Running;
}

void FStateTreeFaceActorTask::ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// clear the AI Controller's focus
	InstanceData.Controller->ClearFocus(EAIFocusPriority::Gameplay);
}

#if WITH_EDITOR
FText FStateTreeFaceActorTask::GetDescription(const FGuid& ID, FStateTreeDataView InstanceDataView, const IStateTreeBindingLookup& BindingLookup, EStateTreeNodeFormatting Formatting /*= EStateTreeNodeFormatting::Text*/) const
{
	return FText::FromString("<b>Face Towards Actor</b>");
}
#endif // WITH_EDITOR

////////////////////////////////////////////////////////////////////

EStateTreeRunStatus FStateTreeFaceLocationTask::EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// set the AI Controller's focus
	InstanceData.Controller->SetFocalPoint(InstanceData.FaceLocation);

	return EStateTreeRunStatus::Running;
}

void FStateTreeFaceLocationTask::ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// clear the AI Controller's focus
	InstanceData.Controller->ClearFocus(EAIFocusPriority::Gameplay);
}

#if WITH_EDITOR
FText FStateTreeFaceLocationTask::GetDescription(const FGuid& ID, FStateTreeDataView InstanceDataView, const IStateTreeBindingLookup& BindingLookup, EStateTreeNodeFormatting Formatting /*= EStateTreeNodeFormatting::Text*/) const
{
	return FText::FromString("<b>Face Towards Location</b>");
}
#endif // WITH_EDITOR

////////////////////////////////////////////////////////////////////

EStateTreeRunStatus FStateTreeSetRandomFloatTask::EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// calculate the output value
	InstanceData.OutValue = FMath::RandRange(InstanceData.MinValue, InstanceData.MaxValue);

	return EStateTreeRunStatus::Running;
}

#if WITH_EDITOR
FText FStateTreeSetRandomFloatTask::GetDescription(const FGuid& ID, FStateTreeDataView InstanceDataView, const IStateTreeBindingLookup& BindingLookup, EStateTreeNodeFormatting Formatting /*= EStateTreeNodeFormatting::Text*/) const
{
	return FText::FromString("<b>Set Random Float</b>");
}
#endif // WITH_EDITOR

////////////////////////////////////////////////////////////////////

EStateTreeRunStatus FStateTreeShootAtTargetTask::EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// tell the character to shoot the target
	InstanceData.Character->StartShooting(InstanceData.Target);

	return EStateTreeRunStatus::Running;
}

void FStateTreeShootAtTargetTask::ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// tell the character to stop shooting
	InstanceData.Character->StopShooting();
}

#if WITH_EDITOR
FText FStateTreeShootAtTargetTask::GetDescription(const FGuid& ID, FStateTreeDataView InstanceDataView, const IStateTreeBindingLookup& BindingLookup, EStateTreeNodeFormatting Formatting /*= EStateTreeNodeFormatting::Text*/) const
{
	return FText::FromString("<b>Shoot at Target</b>");
}
#endif // WITH_EDITOR

EStateTreeRunStatus FStateTreeSenseEnemiesTask::EnterState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// bind the perception updated delegate on the controller
	InstanceData.Controller->OnShooterPerceptionUpdated.BindLambda(
		[WeakContext = Context.MakeWeakExecutionContext()](AActor* SensedActor, const FAIStimulus& Stimulus)
		{
			// get the instance data inside the lambda
			const FStateTreeStrongExecutionContext StrongContext = WeakContext.MakeStrongExecutionContext();
			if (FInstanceDataType* LambdaInstanceData = StrongContext.GetInstanceDataPtr<FInstanceDataType>())
			{
				// have we sensed the enemy directly?
				if (SensedActor->ActorHasTag(LambdaInstanceData->SenseTag))
				{
					// set the controller's target
					LambdaInstanceData->Controller->SetCurrentTarget(SensedActor);

					// set the task output
					LambdaInstanceData->TargetActor = SensedActor;

					// broadcast the see enemy delegate
					StrongContext.BroadcastDelegate(LambdaInstanceData->OnSeeEnemyDelegate);
				}
				// have we sensed something owned by the enemy? firing noise, bullet impacts, etc.
				else if (Stimulus.Tag == LambdaInstanceData->SenseTag)
				{
					bool bDirectLOS = false;

					// calculate the direction of the stimulus
					const FVector StimulusDir = (Stimulus.StimulusLocation - LambdaInstanceData->Character->GetActorLocation()).GetSafeNormal();

					// infer the angle from the dot product between the character facing and the stimulus direction
					const float DirDot = FVector::DotProduct(StimulusDir, LambdaInstanceData->Character->GetActorForwardVector());
					const float MaxDot = FMath::Cos(FMath::DegreesToRadians(LambdaInstanceData->DirectLineOfSightCone));

					// is the direction within our perception cone?
					if (DirDot >= MaxDot)
					{
						// run a line trace between the character and the sensed actor
						FCollisionQueryParams QueryParams;
						QueryParams.AddIgnoredActor(LambdaInstanceData->Character);
						QueryParams.AddIgnoredActor(SensedActor);

						FHitResult OutHit;

						// we have direct line of sight if this trace is unobstructed
						bDirectLOS = !LambdaInstanceData->Character->GetWorld()->LineTraceSingleByChannel(OutHit, LambdaInstanceData->Character->GetActorLocation(), SensedActor->GetActorLocation(), ECC_Visibility, QueryParams);

					}

					// check if we have a direct line of sight to the stimulus
					if (bDirectLOS)
					{
						// set the controller's target
						LambdaInstanceData->Controller->SetCurrentTarget(SensedActor);

						// set the task output
						LambdaInstanceData->TargetActor = SensedActor;

						// broadcast the see enemy delegate
						StrongContext.BroadcastDelegate(LambdaInstanceData->OnSeeEnemyDelegate);

					// no direct line of sight to target
					} else {

						// if we already have a target, ignore the partial sense and keep on them
						if (!IsValid(LambdaInstanceData->TargetActor))
						{
							// scale the last stimulus by time elapsed so we phase it out over time
							const float LastStimulusTime = LambdaInstanceData->Character->GetWorld()->GetTimeSeconds() - LambdaInstanceData->LastStimulusTime;
							const float ScaledStimulus = LambdaInstanceData->LastStimulusStrength / FMath::Max(LastStimulusTime, 1.0f);

							// is this stimulus stronger?
							if (Stimulus.Strength > ScaledStimulus)
							{
								// update the stimulus strength
								LambdaInstanceData->LastStimulusStrength = Stimulus.Strength;

								// update the stimulus time
								LambdaInstanceData->LastStimulusTime = LambdaInstanceData->Character->GetWorld()->GetTimeSeconds();

								// set the investigate location
								LambdaInstanceData->InvestigateLocation = Stimulus.StimulusLocation;

								// broadcast the investigate delegate
								StrongContext.BroadcastDelegate(LambdaInstanceData->OnInvestigateLocationDelegate);
							}
						}
					}
				}
			}
		}
	);

	// bind the perception forgotten delegate on the controller
	InstanceData.Controller->OnShooterPerceptionForgotten.BindLambda(
		[WeakContext = Context.MakeWeakExecutionContext()](AActor* SensedActor)
		{
			// get the instance data inside the lambda
			const FStateTreeStrongExecutionContext StrongContext = WeakContext.MakeStrongExecutionContext();
			if (FInstanceDataType* LambdaInstanceData = StrongContext.GetInstanceDataPtr<FInstanceDataType>())
			{
				// reset the stimulus strength
				LambdaInstanceData->LastStimulusStrength = 0.0f;

				bool bForget = false;

				// are we forgetting the current target?
				if (SensedActor == LambdaInstanceData->TargetActor)
				{
					bForget = true;
				}
				else 
				{
					// are we forgetting about a partial sense while we have no target?
					if (!IsValid(LambdaInstanceData->TargetActor))
					{
						bForget = true;
					}
				}

				if (bForget)
				{
					// clear the target
					LambdaInstanceData->TargetActor = nullptr;

					// clear the target on the controller
					LambdaInstanceData->Controller->ClearCurrentTarget();
					LambdaInstanceData->Controller->ClearFocus(EAIFocusPriority::Gameplay);

					// broadcast the forget delegate
					StrongContext.BroadcastDelegate(LambdaInstanceData->OnForgetEnemyDelegate);
				}
			}
		}
	);

	return EStateTreeRunStatus::Running;
}

void FStateTreeSenseEnemiesTask::ExitState(FStateTreeExecutionContext& Context, const FStateTreeTransitionResult& Transition) const
{
	// get the instance data
	FInstanceDataType& InstanceData = Context.GetInstanceData(*this);

	// unbind the perception delegates
	InstanceData.Controller->OnShooterPerceptionUpdated.Unbind();
	InstanceData.Controller->OnShooterPerceptionForgotten.Unbind();
}

#if WITH_EDITOR
FText FStateTreeSenseEnemiesTask::GetDescription(const FGuid& ID, FStateTreeDataView InstanceDataView, const IStateTreeBindingLookup& BindingLookup, EStateTreeNodeFormatting Formatting /*= EStateTreeNodeFormatting::Text*/) const
{
	return FText::FromString("<b>Sense Enemies</b>");
}
#endif // WITH_EDITOR