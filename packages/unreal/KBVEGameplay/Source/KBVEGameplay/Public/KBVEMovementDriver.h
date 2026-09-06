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

	/**
	 * Put the pawn somewhere, in a way its own simulation agrees with.
	 *
	 * Not a server correction, which reconciles a position the pawn was already
	 * moving towards. This is an outside system deciding where the pawn now is --
	 * a spawn, a level start, a portal -- and a predicted backend has to hear it
	 * as a teleport rather than discover it by finding its own component
	 * somewhere it did not put it. Moving the actor instead is what produces
	 * "movement of the component out-of-band with the simulation", and the
	 * simulation is entitled to ignore it and carry on from where it thought it
	 * was.
	 *
	 * False when the driver has no opinion, so a caller can move the actor
	 * itself and get the old behaviour.
	 */
	virtual bool PlaceAt(const FVector& Position) { return false; }

	/** Hard correction from the server (position + velocity). Most predicted drivers self-correct. */
	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity) {}

	/** Server correction carrying the last consumed input seq, for rollback-replay prediction. */
	virtual void ApplyServerCorrection(const FVector& Position, const FVector& Velocity, uint32 InputAck)
	{
		ApplyServerCorrection(Position, Velocity);
	}
};
