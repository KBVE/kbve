#pragma once

#include "CoreMinimal.h"
#include "KBVEMoverPawn.h"

class UAnimSequence;

#include "RareIconPlayerPawn.generated.h"

/**
 * The player character.
 *
 * All of the movement, camera and input plumbing lives in AKBVEMoverPawn, which
 * is shared across KBVE games and runs server-authoritative Mover with client
 * prediction. This subclass only supplies what is specific to RareIcon: which
 * mesh, which animation blueprint, and which input assets to bind.
 *
 * Those are wired here rather than in a Blueprint so the values show up in a
 * diff -- a pawn Blueprint would put the same six object references in a binary
 * asset nobody can review.
 */
UCLASS()
class ARareIconPlayerPawn : public AKBVEMoverPawn
{
	GENERATED_BODY()

public:
	ARareIconPlayerPawn(const FObjectInitializer& ObjectInitializer);

	virtual void Tick(float DeltaSeconds) override;

	/** Speed, cm/s, at which walking gives way to running. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float RunSpeedThreshold = 350.0f;

	/** Speed below which the character is treated as standing still. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float MoveSpeedThreshold = 10.0f;

	/** Vertical speed beyond which the fall loop plays. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float FallSpeedThreshold = 200.0f;

	/** Ground speed each locomotion clip was authored at, for play-rate scaling. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float WalkClipSpeed = 150.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float RunClipSpeed = 500.0f;

private:
	/** Pick the clip for the current velocity and play it if it is not already. */
	void UpdateLocomotionAnimation();

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> IdleAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> WalkAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> RunAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> FallAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> CurrentAnim;
};
