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

	// Weapon hold. The rifle is placed relative to the chest and both hands are
	// solved onto it, rather than the rifle hanging off a hand: a hand driven by
	// a locomotion clip swings, and anything attached to it swings with it. The
	// weapon is the stable thing and the arms follow it, which is what holding
	// something actually means.
	FBoneReference Chest;
	FBoneReference LeftUpperArm;
	FBoneReference LeftLowerArm;
	FBoneReference LeftHand;
	FBoneReference RightUpperArm;
	FBoneReference RightLowerArm;
	FBoneReference RightHand;

	FTransform WeaponRelativeToChest = FTransform::Identity;

	// The weapon hangs off the trigger hand, so the solver has to find it the
	// same way the component does rather than place it itself.
	FBoneReference WeaponHand;
	FTransform WeaponRelativeToHand = FTransform::Identity;
	FVector LeftHandTargetLocal = FVector::ZeroVector;
	float LeftHandIKAlpha = 0.0f;
	float LeftHandRollDegrees = 0.0f;
	float WeaponBoreHeight = 0.0f;
	FVector LeftGripLocal = FVector::ZeroVector;
	FVector RightGripLocal = FVector::ZeroVector;
	FVector LeftElbowDirection = FVector::ZeroVector;
	FVector RightElbowDirection = FVector::ZeroVector;
	FRotator LeftHandGripRotation = FRotator::ZeroRotator;
	FRotator RightHandGripRotation = FRotator::ZeroRotator;
	float WeaponIKAlpha = 0.0f;

	// Fingers are posed, not solved. A grip is the same shape every frame, so a
	// solver would spend itself reproducing a constant; these are the constant.
	TArray<FBoneReference> LeftFingers;
	TArray<FBoneReference> RightFingers;
	float FingerCurlDegrees = 0.0f;
	float ThumbCurlDegrees = 0.0f;
	int32 FingersPerHand = 0;

	// Closing the support hand onto a weapon the clip was not authored around.
	// Independent of the procedural hold above: the clip poses the arms, and
	// only the grip radius needs correcting.
	float LeftGripCurlDegrees = 0.0f;
	float LeftGripThumbDegrees = 0.0f;
	FVector FingerCurlAxis = FVector::UpVector;

private:
	FAnimNode_SequencePlayer& CurrentPlayer() { return bUsingA ? SequenceA : SequenceB; }
	FAnimNode_SequencePlayer& PreviousPlayer() { return bUsingA ? SequenceB : SequenceA; }

	/** Solve one leg so its foot reaches its ground point, and lies along it. */
	void SolveLeg(FCSPose<FCompactPose>& Pose, const FBoneReference& Thigh, const FBoneReference& Calf,
		const FBoneReference& Foot, const FVector& Correction, const FVector& GroundNormal) const;

	/**
	 * Two-bone solve onto an absolute target, for an arm.
	 *
	 * Separate from SolveLeg rather than shared with it: a leg is corrected by a
	 * delta from wherever the clip put the foot and rolls onto a ground normal,
	 * an arm is sent to a position the weapon dictates and takes the weapon's
	 * orientation. The elbow hint also differs -- a knee that has lost its hint
	 * bends forward, an elbow bends back, and using the leg's fallback here
	 * inverts the arm.
	 */
	void SolveArm(FCSPose<FCompactPose>& Pose, const FBoneReference& UpperArm, const FBoneReference& LowerArm,
		const FBoneReference& Hand, const FVector& Target, const FVector& ElbowDirection,
		const FQuat& HandRotation, float Alpha, float RotationAlpha,
		const FQuat& RotationDelta = FQuat::Identity) const;

	/** Close the fingers by a fixed amount about their own bend axis. */
	void PoseFingers(FCompactPose& Pose, const TArray<FBoneReference>& Fingers, float Alpha) const;

	/** Add curl on top of whatever the clip already posed, in degrees. */
	void CurlFingers(FCompactPose& Pose, const TArray<FBoneReference>& Fingers,
		float FingerDegrees, float ThumbDegrees) const;

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

	/**
	 * Where the weapon sits relative to the chest, and where the hands go on it.
	 *
	 * Solved rather than posed by hand. Manny's arm is 27.8 + 27.2 cm, so a hand
	 * further than about 47 cm from its shoulder cannot be reached and the solver
	 * straightens the arm and misses. These defaults put the trigger hand 24 cm
	 * from its shoulder and the support hand 43 cm from its own -- a bent firing
	 * arm and an extended but not locked support arm, which is the shape of an
	 * actual rifle hold.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FTransform WeaponRelativeToChest = FTransform(
		FRotator(-33.27f, 117.49f, -99.73f), FVector(-32.71f, 27.68f, -12.30f));

	/** Grip points in the weapon's own space. Measured off the stock geometry. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FVector RightGripLocal = FVector(-37.0f, 0.0f, 0.0f);

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FVector LeftGripLocal = FVector(-7.0f, 0.0f, -1.0f);

	/**
	 * Which way each elbow is pushed, as a direction from its own shoulder in
	 * component space.
	 *
	 * An elbow has one degree of freedom once the shoulder and hand are fixed,
	 * and nothing in the pose decides it, so it is stated. Anchored to the
	 * shoulder rather than to the weapon on purpose: a hint held in the weapon's
	 * space swings with the barrel, so aiming the rifle drags the elbows around
	 * the arm axis with it and the joints invert as it passes through them.
	 *
	 * Manny faces +Y with his right on -X. The firing elbow drops out to the
	 * right and back; the support elbow tucks straight down under the barrel.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FVector RightElbowDirection = FVector(-0.5f, -0.3f, -0.8f);

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FVector LeftElbowDirection = FVector(0.2f, 0.0f, -0.98f);

	/** Hand orientation relative to the weapon, so the palms face the stock. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FRotator RightHandGripRotation = FRotator(0.0f, 0.0f, 0.0f);

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FRotator LeftHandGripRotation = FRotator(0.0f, 0.0f, 180.0f);

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FName ChestBone = TEXT("spine_05");

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	bool bHoldWeapon = false;

	/**
	 * Lift the support hand onto the weapon the clip is already holding.
	 *
	 * Distinct from bHoldWeapon, which poses arms that hold nothing. This is a
	 * correction: the rifle clips place the support hand for their own weapon,
	 * and against this one its knuckles finish two to four centimetres under the
	 * fore-end -- close enough to look intentional and wrong enough to read as
	 * hovering. Everything else about the pose is kept.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	bool bSolveLeftHandToWeapon = true;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float LeftHandIKAlpha = 1.0f;

	/**
	 * Where the support wrist belongs, in the weapon's space.
	 *
	 * Measured, not chosen: with the clip pose the left knuckle lands at
	 * (1.2, -0.4, -0.5) and the wrist at (-4.0, -7.4, 3.2), so the wrist sits
	 * (-5.2, -7.0, 3.7) from the knuckle. Putting that knuckle on the underside
	 * of the fore-end, at z = +2, puts the wrist here.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FVector LeftHandTargetLocal = FVector(-4.0f, -7.0f, 5.7f);

	/** Bone the weapon is attached to, and its offset from that bone. */
	/**
	 * Roll the support hand around the barrel, degrees.
	 *
	 * The clips grip a weapon far thicker than this one and meet it side-on, so
	 * the wrist ends up level with the bore and out beside it -- a hand hanging
	 * next to the fore-end rather than under it. Rolling about the barrel is the
	 * one correction that fixes that without breaking the grip: every knuckle
	 * keeps its distance from the axis, so contact is preserved and only where
	 * the hand sits around the circumference changes.
	 *
	 * Thirty degrees, and the number is a compromise rather than a solve. The
	 * wrist starts at 174 degrees around the bore, level with it, and geometry
	 * alone says a support wrist belongs near 253 -- underneath. Rolling the
	 * whole eighty degrees to get there does put it under, but it also carries
	 * the clip's finger pose round with it until the fingers point away from the
	 * weapon rather than around it, because they were authored to meet a much
	 * thicker fore-end from the side. Thirty drops the wrist below the bore and
	 * leaves the knuckles at 2.5 to 3.0 cm, still closed on the wood.
	 *
	 * The real fix is a support-hand pose authored for this weapon. Until there
	 * is one, this is the most correction the clip will take.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float LeftHandRollDegrees = 30.0f;

	/**
	 * Height of the bore above the weapon's own X axis, cm.
	 *
	 * Not zero, and assuming it was cost a round of this: a rifle's barrel sits
	 * above its stock line, by about 5 cm at the fore-end on this model, so the
	 * axis the hand rolls about is not the axis the mesh is modelled around.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float WeaponBoreHeight = 5.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FName WeaponHandBone = TEXT("hand_r");

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FTransform WeaponRelativeToHand = FTransform::Identity;

	/**
	 * Extra curl on the support hand, degrees per joint, added to the clip.
	 *
	 * The rifle clips are authored around a weapon with a much thicker fore-end
	 * than this one: measured against our barrel their left fingertips sit 4.7
	 * to 5.1 cm from its centreline while the knuckles sit at 1.3 to 2.3 -- the
	 * hand lies open along the barrel instead of closing round it. Curling the
	 * joints further is what brings the fingertips back onto a thinner weapon,
	 * and it is additive so the clip still owns the pose.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float LeftGripCurlDegrees = 45.0f;

	/**
	 * The thumb takes its own amount, and less of it.
	 *
	 * It does not share the fingers' bend axis, so curling it about the same one
	 * only approximates: measured tip distance from the barrel improves from
	 * 7.8 cm to 5.5 at -30 and gets worse again by -55, because past a point it
	 * swings through and back out. -30 is the measured best rather than the
	 * result of a solve, and a thumb laid along a fore-end rather than wrapped
	 * under it is what a support hand does anyway.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float LeftGripThumbDegrees = -30.0f;

	/**
	 * Bone-local axis a finger joint bends about.
	 *
	 * Y on this skeleton, found by trying all three and measuring which one
	 * pulls the fingertips toward the barrel: X and Z both push them further out.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	FVector FingerCurlAxis = FVector(0.0f, 1.0f, 0.0f);

	/** Seconds to raise or lower the weapon hold. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float WeaponBlendTime = 0.25f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float FingerCurlDegrees = 62.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float ThumbCurlDegrees = 34.0f;

	/** Current weapon-hold blend, readable so the pawn can match the mesh to it. */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Animation|Weapon")
	float GetWeaponIKAlpha() const { return WeaponAlpha; }

	UFUNCTION(BlueprintCallable, Category = "KBVE|Animation|Weapon")
	void SetHoldWeapon(bool bHold) { bHoldWeapon = bHold; }

protected:
	virtual void NativeUpdateAnimation(float DeltaSeconds) override;
	virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override { return new FKBVEFootIKProxy(this); }
	virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override { delete InProxy; }

private:
	/** Ground height under a foot, or the fallback when nothing is beneath it. */
	bool TraceGroundUnderFoot(const FName& FootBone, float FallbackZ, float& OutGroundZ, FVector& OutNormal) const;

	/** Cap a ground normal to MaxFootTilt so a steep face cannot lay a foot on its side. */
	FVector ClampNormalToTilt(const FVector& Normal) const;

	float WeaponAlpha = 0.0f;

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
