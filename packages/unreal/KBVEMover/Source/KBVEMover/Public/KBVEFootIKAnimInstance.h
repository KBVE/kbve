#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimNode_SequencePlayer.h"
#include "BoneContainer.h"

#include "KBVEFootIKAnimInstance.generated.h"

class UAnimSequence;

/**
 * Evaluates one locomotion clip and plants both feet on the ground under them.
 *
 * A clip poses both feet at a fixed height relative to the root, so on any
 * slope one foot sinks into the terrain and the other hangs above it. This
 * traces the ground beneath each foot, drops the pelvis to whichever foot is
 * lower, then solves each leg to reach its own ground point.
 *
 * Written as a native proxy rather than an animation blueprint so the whole
 * solve reads in a diff. There is no state machine and no blending here yet --
 * the owning pawn still picks a single clip -- so this is the ground-adaptation
 * layer only, and a locomotion graph replaces the sequence player later.
 */
USTRUCT()
struct FKBVEFootIKProxy : public FAnimInstanceProxy
{
	GENERATED_BODY()

	FKBVEFootIKProxy() = default;
	explicit FKBVEFootIKProxy(UAnimInstance* InAnimInstance) : FAnimInstanceProxy(InAnimInstance) {}

	virtual void Initialize(UAnimInstance* InAnimInstance) override;
	virtual void CacheBones() override;
	virtual void UpdateAnimationNode(const FAnimationUpdateContext& InContext) override;
	virtual bool Evaluate(FPoseContext& Output) override;

	/**
	 * Two players and a crossfade between them, rather than one: swapping a
	 * single player's clip changes the pose in one frame, which reads as the
	 * character snapping into the new animation.
	 */
	FAnimNode_SequencePlayer SequenceA;
	FAnimNode_SequencePlayer SequenceB;

	/** The clip the game thread wants, and how long to take getting there. */
	TObjectPtr<UAnimSequence> RequestedClip;
	float RequestedPlayRate = 1.0f;
	float ClipBlendTime = 0.14f;

	/** Which player holds the incoming clip, and how far the fade has run. */
	bool bUsingA = true;
	float BlendAlpha = 1.0f;

	/** Names resolved once in CacheBones; empty names disable that leg. */
	FBoneReference LeftFoot;
	FBoneReference LeftCalf;
	FBoneReference LeftThigh;
	FBoneReference RightFoot;
	FBoneReference RightCalf;
	FBoneReference RightThigh;
	FBoneReference Pelvis;

	/** Corrections in component space, already smoothed. */
	FVector LeftFootCorrection = FVector::ZeroVector;
	FVector RightFootCorrection = FVector::ZeroVector;
	float LeftFootOffset = 0.0f;
	float RightFootOffset = 0.0f;
	float PelvisOffset = 0.0f;
	bool bFootIKEnabled = false;

	/** Ground normals under each foot, in component space, already smoothed. */
	FVector LeftFootNormal = FVector::UpVector;
	FVector RightFootNormal = FVector::UpVector;
	bool bAlignFeetToGround = true;

	/**
	 * Foot height above the character root, in cm, at which the clip is treated
	 * as having lifted the foot to swing it, and the height by which the solve
	 * has faded out entirely. Applying ground correction to a swinging foot
	 * drags it back down, so the character never picks its feet up -- which is
	 * exactly what a shuffle is.
	 */
	float StanceHeight = 12.0f;
	float SwingHeight = 28.0f;

	/** Torso pitch, in degrees, that follows the landing dip. */
	float SpineLeanDegrees = 0.0f;
	FBoneReference Spine;

private:
	FAnimNode_SequencePlayer& CurrentPlayer() { return bUsingA ? SequenceA : SequenceB; }
	FAnimNode_SequencePlayer& PreviousPlayer() { return bUsingA ? SequenceB : SequenceA; }

	/** Solve one leg so its foot reaches its ground point, and lies along it. */
	void SolveLeg(FCSPose<FCompactPose>& Pose, const FBoneReference& Thigh, const FBoneReference& Calf,
		const FBoneReference& Foot, const FVector& Correction, const FVector& GroundNormal) const;
};

UCLASS()
class KBVEMOVER_API UKBVEFootIKAnimInstance : public UAnimInstance
{
	GENERATED_BODY()

public:
	/** The clip the owning pawn wants playing, and its rate. */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Animation")
	void SetLocomotionClip(UAnimSequence* Clip, float PlayRate);

	/** Bone names for the two leg chains. Defaults match the UE mannequin. */
	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName LeftFootBone = TEXT("foot_l");

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName LeftCalfBone = TEXT("calf_l");

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName LeftThighBone = TEXT("thigh_l");

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName RightFootBone = TEXT("foot_r");

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName RightCalfBone = TEXT("calf_r");

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName RightThighBone = TEXT("thigh_r");

	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|FootIK")
	FName PelvisBone = TEXT("pelvis");

	/**
	 * Manual trim, in cm, added to every foot correction. Zero is correct when
	 * the clip already plants the feet on flat ground; raise it only if the
	 * whole character reads as slightly sunk or floating.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float FootHeightTrim = 0.0f;

	/** How far above and below the foot to look for ground, in cm. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float TraceAboveFoot = 50.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float TraceBelowFoot = 60.0f;

	/** Largest correction a single foot may take, in cm. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float MaxFootLift = 45.0f;

	/** Correction speed, cm/s. Low enough to hide trace noise, high enough to keep up. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float InterpSpeed = 180.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	bool bEnableFootIK = true;

	/**
	 * Roll each foot onto the surface under it. Without this the foot stays
	 * level while the ground tilts, so the heel or toe lifts even when the
	 * ankle is at exactly the right height.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	bool bAlignFeetToGround = true;

	/** Largest angle a foot may be rolled onto the ground, in degrees. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float MaxFootTilt = 40.0f;

	/** Rotation correction speed, degrees/s. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float TiltInterpSpeed = 240.0f;

	/**
	 * Seconds to fade the solve out on leaving the ground. Airborne feet have no
	 * ground to sit on, and holding the solve through a jump drags the pelvis
	 * toward whatever is far below.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float AirborneBlendTime = 0.15f;

	/**
	 * Seconds to bring the solve back on landing, deliberately far shorter than
	 * fading it out. A fall clip holds the legs tucked, so at the moment of
	 * contact the feet are tens of centimetres above the ground; fading the
	 * solve in over the same time as the clip blend leaves them following that
	 * pose down through the air, which reads as the legs snapping into place.
	 * Coming back quickly plants the feet on contact and lets the knees bend.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float LandingBlendTime = 0.04f;

	/** Bone the landing dip bends, so the torso follows the hips rather than riding rigid. */
	UPROPERTY(EditDefaultsOnly, Category = "KBVE|Animation|Landing")
	FName SpineBone = TEXT("spine_01");

	/**
	 * How far the hips drop per cm/s of downward speed at touchdown. The feet
	 * stay planted by the same solve that plants them standing, so the dip
	 * bends the knees rather than sinking the character.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	float LandingDipPerSpeed = 0.22f;

	/** Hard cap on the dip, in cm. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	float MaxLandingDip = 30.0f;

	/** Downward speed, cm/s, below which a landing is not worth absorbing. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	float LandingSpeedThreshold = 150.0f;

	/** Spring pulling the hips back up, and the damping that stops it oscillating. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	float LandingSpringStiffness = 115.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	float LandingSpringDamping = 13.0f;

	/** Degrees of torso pitch at the deepest allowed dip. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	float LandingSpineLean = 14.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Landing")
	bool bAbsorbLandings = true;

	/**
	 * Seconds to cross-fade between locomotion clips. A single sequence player
	 * changes pose in one frame, which is what makes a landing read as the
	 * character teleporting into the idle pose.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation")
	float ClipBlendTime = 0.2f;

	/**
	 * Pin a foot to the spot it was planted on until the clip lifts it again.
	 *
	 * Play-rate scaling only approximates a clip's stride against real ground
	 * speed, so a decelerating character keeps taking steps while it barely
	 * moves and the planted foot scrubs across the ground. Holding the foot
	 * still and letting the leg bend around it is what stops the shuffle.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootLock")
	bool bLockPlantedFeet = true;

	/**
	 * Height of the foot bone above the ground, in cm, below which the foot
	 * counts as planted. The ankle sits a little above the sole even in a
	 * perfect stance, so this is that height plus room for the pose, and well
	 * under the height the clip lifts the foot to when it swings.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootLock")
	float PlantGapHeight = 12.0f;

	/** Distance from the lock, in cm, past which the foot is released. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootLock")
	float MaxLockDistance = 40.0f;

	/** How fast a lock fades in and out, cm/s, so releasing does not pop. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootLock")
	float LockBlendSpeed = 400.0f;

	/** Foot height above the root, in cm, where the solve is at full strength. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float StanceHeight = 12.0f;

	/** Foot height above the root, in cm, where the solve has faded out. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|FootIK")
	float SwingHeight = 28.0f;

protected:
	virtual void NativeUpdateAnimation(float DeltaSeconds) override;
	virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override { return new FKBVEFootIKProxy(this); }
	virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override { delete InProxy; }

private:
	/** Ground height under a foot, or the fallback when nothing is beneath it. */
	bool TraceGroundUnderFoot(const FName& FootBone, float FallbackZ, float& OutGroundZ, FVector& OutNormal) const;

	/** Cap a ground normal to MaxFootTilt so a steep face cannot lay a foot on its side. */
	FVector ClampNormalToTilt(const FVector& Normal) const;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> PendingClip;

	float PendingPlayRate = 1.0f;
	float SmoothedLeft = 0.0f;
	float SmoothedRight = 0.0f;
	float SmoothedPelvis = 0.0f;
	FVector SmoothedLeftNormal = FVector::UpVector;
	FVector SmoothedRightNormal = FVector::UpVector;

	/** Per-foot planting state, in world space. */
	struct FFootLock
	{
		FVector Position = FVector::ZeroVector;
		FVector Correction = FVector::ZeroVector;
		bool bLocked = false;
	};
	FFootLock LeftLock;
	FFootLock RightLock;

	/** Previous world positions, for measuring how fast each foot is sliding. */
	FVector LastLeftFoot = FVector::ZeroVector;
	FVector LastRightFoot = FVector::ZeroVector;
	bool bHasLastFeet = false;

	/** Update one foot's lock and return its world-space correction. */
	FVector UpdateFootLock(FFootLock& Lock, const FName& FootBone, float RootZ, bool bGrounded,
		float AppliedAlpha, float DeltaSeconds) const;
	float GroundedAlpha = 1.0f;

	/** Landing absorption state: a mass on a spring, displaced by the impact. */
	float LandingDip = 0.0f;
	float LandingDipVelocity = 0.0f;
	bool bWasAirborne = false;
	float LastAirborneSpeedZ = 0.0f;
	int32 LandingTraceFrames = 0;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> LastLoggedClip;
};
