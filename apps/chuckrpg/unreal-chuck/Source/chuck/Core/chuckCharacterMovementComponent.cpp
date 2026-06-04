#include "chuckCharacterMovementComponent.h"

#include "GameFramework/Character.h"

UchuckCharacterMovementComponent::UchuckCharacterMovementComponent()
{
}

float UchuckCharacterMovementComponent::GetMaxSpeed() const
{
	if (MovementMode == MOVE_Walking || MovementMode == MOVE_NavWalking)
	{
		return bWantsToSprint ? SprintSpeed : WalkSpeed;
	}
	return Super::GetMaxSpeed();
}

void UchuckCharacterMovementComponent::UpdateFromCompressedFlags(uint8 Flags)
{
	Super::UpdateFromCompressedFlags(Flags);
	bWantsToSprint = (Flags & FSavedMove_Character::FLAG_Custom_0) != 0;
}

FNetworkPredictionData_Client* UchuckCharacterMovementComponent::GetPredictionData_Client() const
{
	check(PawnOwner != nullptr);
	if (!ClientPredictionData)
	{
		UchuckCharacterMovementComponent* MutableThis = const_cast<UchuckCharacterMovementComponent*>(this);
		MutableThis->ClientPredictionData = new FNetworkPredictionData_Client_chuck(*this);
		MutableThis->ClientPredictionData->MaxSmoothNetUpdateDist = 92.f;
		MutableThis->ClientPredictionData->NoSmoothNetUpdateDist  = 140.f;
	}
	return ClientPredictionData;
}

FSavedMove_chuck::FSavedMove_chuck()
	: bSavedWantsToSprint(0)
{
}

void FSavedMove_chuck::Clear()
{
	Super::Clear();
	bSavedWantsToSprint = 0;
}

uint8 FSavedMove_chuck::GetCompressedFlags() const
{
	uint8 Result = Super::GetCompressedFlags();
	if (bSavedWantsToSprint)
	{
		Result |= FLAG_Custom_0;
	}
	return Result;
}

bool FSavedMove_chuck::CanCombineWith(const FSavedMovePtr& NewMove, ACharacter* InCharacter, float MaxDelta) const
{
	const FSavedMove_chuck* NewChuckMove = static_cast<FSavedMove_chuck*>(NewMove.Get());
	if (bSavedWantsToSprint != NewChuckMove->bSavedWantsToSprint)
	{
		return false;
	}
	return Super::CanCombineWith(NewMove, InCharacter, MaxDelta);
}

void FSavedMove_chuck::SetMoveFor(ACharacter* Character, float InDeltaTime, FVector const& NewAccel, FNetworkPredictionData_Client_Character& ClientData)
{
	Super::SetMoveFor(Character, InDeltaTime, NewAccel, ClientData);
	if (UchuckCharacterMovementComponent* CMC = Cast<UchuckCharacterMovementComponent>(Character->GetCharacterMovement()))
	{
		bSavedWantsToSprint = CMC->bWantsToSprint ? 1 : 0;
	}
}

void FSavedMove_chuck::PrepMoveFor(ACharacter* Character)
{
	Super::PrepMoveFor(Character);
	if (UchuckCharacterMovementComponent* CMC = Cast<UchuckCharacterMovementComponent>(Character->GetCharacterMovement()))
	{
		CMC->bWantsToSprint = (bSavedWantsToSprint != 0);
	}
}

FNetworkPredictionData_Client_chuck::FNetworkPredictionData_Client_chuck(const UCharacterMovementComponent& ClientMovement)
	: Super(ClientMovement)
{
}

FSavedMovePtr FNetworkPredictionData_Client_chuck::AllocateNewMove()
{
	return FSavedMovePtr(new FSavedMove_chuck());
}
