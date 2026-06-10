#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "KBVEMovementDriver.generated.h"

UINTERFACE(MinimalAPI, BlueprintType)
class UKBVEMovementDriver : public UInterface
{
	GENERATED_BODY()
};

/**
 * Abstraction seam over a pawn's movement backend so gameplay code does not hard-bind
 * to one system. Lets the avatar swap between CMC, Mover, or a Mass/custom sim without
 * rewriting callers. Implementations: a Mover-backed pawn (KBVEMover), a CMC wrapper,
 * etc. Default impls are no-ops so partial drivers are valid.
 *
 * Transport (Iris / KBVENet snapshots) is orthogonal — a driver decides how movement
 * is simulated, not how it replicates.
 */
class KBVEGAMEPLAY_API IKBVEMovementDriver
{
	GENERATED_BODY()

public:
	/** World-space directional intent for this frame, magnitude 0..1 (zero = stop). */
	virtual void SubmitMoveInput(const FVector& WorldIntent) {}

	/** Jump hold state. */
	virtual void SubmitJump(bool bPressed) {}

	/** Current authoritative velocity (cm/s). */
	virtual FVector GetAuthoritativeVelocity() const { return FVector::ZeroVector; }

	/** Hard correction from the server (position + velocity). Most predicted drivers self-correct. */
	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) {}
};
