#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimNode_SequencePlayer.h"
#include "BoneContainer.h"

#include "KBVEFootIKAnimInstance.generated.h"

class UAnimSequence;
class UKBVEWeaponGrip;

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

	// The twist bones the skin between forearm and hand is weighted to.
	//
	// A limb can hold every joint angle a body allows and still pinch at the
	// wrist if these lag behind the hand's roll, because the shear is in the
	// skinning and not in the pose -- no joint measurement will ever show it.
	// Measured: the grip solve adds 21 degrees of axial roll at the left wrist
	// against nothing at the untouched right, and the clip keys every one of
	// these bones flat, so the whole 21 lands across the span of skin between
	// the last twist bone and the hand. That is the candy wrapper.
	FBoneReference LeftForearmTwist;
	FBoneReference LeftForearmTwist2;
	FBoneReference RightForearmTwist;
	FBoneReference RightForearmTwist2;

	// Signed axial roll each hand gained over the clip, about its own forearm.
	// Written by the solve, spent on the twist bones after the pose is back in
	// local space.
	mutable float LeftHandRollAdded = 0.0f;
	mutable float RightHandRollAdded = 0.0f;

	float WristTwistShare = 1.0f;
	float MaxForearmTwistDegrees = 45.0f;

	// Fit the weapon to the hands instead of the hands to the weapon.
	//
	// The rifle clips already pose a correct two-handed hold; what was wrong was
	// never the hand but where the weapon sat relative to it. Solving the hand
	// onto a misplaced weapon meant destroying that hold and then rebuilding it
	// -- restore the wrist, clamp the bend, spread the twist, re-swing the palm,
	// four corrections each repairing damage from the one before, and the wrist
	// still read as wrenched. Aiming the weapon at the hand instead touches no
	// hand bone at all, so the shear it was producing cannot arise.
	bool bFitWeaponToHands = true;
	mutable FTransform FittedWeaponRelativeToHand = FTransform::Identity;
	mutable float WeaponFitDegrees = 0.0f;

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

	// Contact solve for the support hand. The clip's finger pose is a starting
	// shape rather than an answer: the wrist is rolled to where the geometry
	// says it belongs, the palm is turned to face the bore, and every finger
	// closes until it meets the fore-end. Nothing here is tuned to one weapon --
	// the wrap falls out of the radius it is closing onto.
	bool bGripContactSolve = false;
	bool bGripSolveFingers = false;
	float ForeEndHalfWidth = 0.0f;
	float ForeEndHalfHeight = 0.0f;
	float ForeEndCentreHeight = 0.0f;
	float GripWristOffset = 0.0f;
	float GripKnuckleClearance = 0.0f;
	float GripAlongBarrel = 0.0f;
	float GripAlongMin = 0.0f;
	float GripAlongMax = 0.0f;
	float GripArmExtension = 0.0f;
	float GripFingerLeanDegrees = 0.0f;
	float MaxGripTwistDegrees = 0.0f;
	mutable float GripTwistApplied = 0.0f;
	mutable float GripTwistWanted = 0.0f;
	float MaxWristRollDegrees = 0.0f;
	float MaxWristBendDegrees = 0.0f;
	mutable float GripRollApplied = 0.0f;
	mutable float GripRollWanted = 0.0f;

	// The authored finger pose, sampled once and kept. A pose is the same every
	// frame, so reading it per frame would be a pose evaluation spent to learn
	// what it already knew.
	TObjectPtr<UAnimSequence> SupportHandPose;
	float SupportHandPoseTime = 0.0f;
	float SupportHandPoseWeight = 0.0f;
	TArray<FTransform> GripPoseLocals;

	// The authored grip, one angle per finger joint, in LeftFingers order.
	// Flattened from the weapon's asset so the solver never has to know that a
	// grip is described per chain.
	TArray<float> GripFingerAngles;
	bool bGripPoseSampled = false;
	float GripBoreAngleDegrees = 0.0f;
	float FingertipLength = 0.0f;
	float MaxGripCurlDegrees = 0.0f;
	float ThumbCurlScale = 0.0f;

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

	/**
	 * Read the authored support-hand pose, once, into GripPoseLocals.
	 *
	 * Sampled against the bone container the pose is being evaluated with, so
	 * the finger bones line up without a name lookup per frame.
	 */
	void SampleGripPose(const FBoneContainer& Container);

	/** Add curl on top of whatever the clip already posed, in degrees. */
	void CurlFingers(FCompactPose& Pose, const TArray<FBoneReference>& Fingers,
		float FingerDegrees, float ThumbDegrees) const;

	/**
	 * Solve the whole support grip against the weapon rather than pose it.
	 *
	 * Three solves, in the only order they work in: the wrist is rolled around
	 * the bore to the angle a support wrist belongs at, the hand is turned so
	 * its own palm plane faces the bore axis, and then each finger is closed
	 * about its bend axis until some part of it touches the fore-end cylinder.
	 * The third step is what removes the tuned constants -- a finger stops where
	 * the weapon stops it, so a thinner fore-end simply closes further.
	 */
	void SolveGrip(FCSPose<FCompactPose>& Pose, const FTransform& WeaponTransform,
		TArray<float>& OutCurlDegrees) const;
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
	float LeftHandIKAlpha = 0.0f;

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
	 * Solve the support grip against the weapon instead of posing it.
	 *
	 * With this on, LeftHandRollDegrees, LeftGripCurlDegrees and
	 * LeftGripThumbDegrees are all unused: the roll comes from
	 * LeftGripBoreAngleDegrees and the curl comes from where each finger hits
	 * ForeEndRadius. Off, the tuned constants above are used as before.
	 */
	/**
	 * The weapon being held, as data.
	 *
	 * Set this and the section, the grip point and the finger pose all come
	 * from it, which is what makes a second rifle an asset rather than another
	 * round of tuning. The loose properties below are the fallback for a weapon
	 * with no asset yet.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Animation|Weapon")
	TObjectPtr<UKBVEWeaponGrip> WeaponGrip;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	bool bGripContactSolve = true;

	/**
	 * Aim the weapon at the support hand rather than the hand at the weapon.
	 *
	 * The rifle clips pose a correct two-handed hold already. Solving the left
	 * hand onto a weapon placed somewhere else destroys that hold and then
	 * spends four passes rebuilding it, and still reads as a wrenched wrist.
	 * Swinging the rifle about the trigger hand until its fore-end reaches the
	 * support hand writes no hand bone at all, so there is nothing to wrench.
	 *
	 * The cost is that the weapon rides the animation rather than being steady
	 * on its own: it is held by the hands, which is what holding is.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	bool bFitWeaponToHands = false;

	/** Where the fit put the weapon, for the component to follow. Read-only. */
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|Animation|Weapon")
	FTransform FittedWeaponRelativeToHand;

	/**
	 * Close the fingers onto the weapon when there is no authored pose.
	 *
	 * Off. The search does reach the wood, but it bends each finger up to eighty
	 * degrees at every joint about a single axis, and a hand with four fingers
	 * cranked to their limit is a claw -- which reads as a mangled, twisted hand
	 * even when the wrist behind it is exactly where the animator put it.
	 *
	 * Leaving it off keeps the clip's own fingers, which were posed by hand and
	 * look like a hand. They will not conform to this weapon's fore-end; that is
	 * what the authored pose is for, and a slightly wrong hand shape reads far
	 * better than a right one no hand could make.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	bool bGripSolveFingers = false;

	/**
	 * The section a support hand actually closes on, in the weapon's own space.
	 *
	 * Measured off the mesh rather than assumed, and the assumption is what cost
	 * several rounds of this: the fore-end is not a cylinder around the bore. It
	 * is a wooden block sitting under the barrel -- 4.2 cm wide, 7.0 cm tall,
	 * its centre 3.3 cm up, while the bore runs at 5.35. Rolling a wrist around
	 * the bore and closing fingers onto a 2.5 cm circle was therefore solving
	 * against a shape the rifle does not have.
	 *
	 * Half-extents, so the section is an ellipse: a hand wrapping this meets
	 * 2.1 cm at the sides and 3.5 cm below.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float ForeEndHalfWidth = 2.1f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float ForeEndHalfHeight = 3.5f;

	/** Height of that section's centre above the weapon's X axis, cm. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float ForeEndCentreHeight = 3.3f;

	/**
	 * How far the wrist sits outside the fore-end surface, cm.
	 *
	 * The wrist target is derived from the section rather than stated: the palm
	 * lies on the wood and the wrist joint is behind it by roughly the thickness
	 * of a hand. LeftHandTargetLocal was measured against a fore-end that was
	 * thought to be a thin cylinder on the bore, which put it level with the
	 * barrel and out beside it -- a hand next to the rifle rather than under it.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripWristOffset = 4.5f;

	/**
	 * How far off the wood the knuckles are seated, cm.
	 *
	 * The wrist offset above is only a starting guess now -- the solve measures
	 * where the knuckles actually land and moves the wrist in by whatever they
	 * miss by, which is what a guess cannot do. This is the one part of that
	 * worth stating: a knuckle placed exactly on the surface is inside it once
	 * the hand is skinned, so the target is just clear of it.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripKnuckleClearance = 0.6f;

	/**
	 * Where along the barrel the support hand grips, in the weapon's space.
	 *
	 * The old target gripped at x = -4, which is the far end of the woodwork,
	 * and measuring it says that point is 52.8 cm from the left shoulder against
	 * a 49.0 cm arm -- past the end of the arm, so the solver straightened it
	 * and stopped short and the fingers closed on air. The fore-end runs from
	 * about -18 to -4, so gripping the middle of it is both where a support hand
	 * belongs and eight centimetres nearer the shoulder.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripAlongBarrel = -18.0f;

	/**
	 * How far along the fore-end the hand may slide, weapon-space cm.
	 *
	 * A support hand is not nailed to one spot on the wood, and measuring says
	 * it cannot be: the clip swings the trigger hand, and with it the rifle, so
	 * the fore-end travels between 42 and 48 cm from the left shoulder over one
	 * run. A fixed grip point is therefore beyond reach on some frames and
	 * slack on others -- the arm locks straight and the fingers close on air,
	 * which is what a hand not touching the gun looks like. The bounds are the
	 * woodwork's own, measured off the mesh.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripAlongMin = -18.0f;

	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripAlongMax = -6.0f;

	/**
	 * How much of the arm's length the grip should use, as a fraction.
	 *
	 * Below one, so the elbow keeps a bend. An arm solved to exactly its own
	 * length is straight, and a straight support arm reads as a mannequin
	 * holding a prop rather than a person carrying a rifle.
	 *
	 * Zero, which turns the sliding hold off and pins the hand at
	 * GripAlongBarrel. It is off because it measured worse than the fixed hold
	 * it replaced: the point it scores is not the point the arm is finally sent
	 * to -- the seating step moves that afterwards -- so it picked the forward
	 * end of the wood and left the arm 3 cm short of its own target. The idea is
	 * sound and the scoring is not; it needs to run against the seated target
	 * rather than the one before seating.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripArmExtension = 0.0f;

	/**
	 * How the fingers cross the fore-end, degrees, where 90 is square across it.
	 *
	 * Ninety, which is square, because leaning them was measured and does not
	 * do what it looks like it should: the twist the solve asks for is 43.8
	 * degrees at square and rises to 50.2 by fifty, so leaning the fingers makes
	 * the wrist worse rather than better. The twist comes from the palm being
	 * turned to face the wood, not from where the fingers point. Left adjustable
	 * because it changes how the hand reads even though it does not help here.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float GripFingerLeanDegrees = 90.0f;

	/**
	 * The most the solve may turn the wrist to lay the palm on the wood.
	 *
	 * Zero, which switches the palm turn off, and that is the measurement
	 * rather than a preference: with it disabled the hand's roll about its own
	 * forearm is 0.0 degrees at every grip angle, and with it enabled the roll
	 * is 89 degrees and rises to 126. The arm solve contributes none of it. The
	 * turn was the entire source of the wrenched wrist.
	 *
	 * What it bought was the palm facing the fore-end, which the finger contact
	 * search needed. It is not worth a wrist no arm can make, and an authored
	 * pose does not need it: the clip's own wrist is one an animator posed to
	 * read as a hand holding a rifle, and moving that hand to the weapon does
	 * not spoil it.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float MaxGripTwistDegrees = 0.0f;

	/**
	 * The most the hand may roll about its own forearm, degrees.
	 *
	 * Distinct from the twist cap above, and the one that matters to the eye. A
	 * hand swung a long way still reads as a hand; a hand rolled about its own
	 * forearm reads as broken well before thirty degrees, because that is the
	 * axis a wrist has least of. The two are separated by a swing-twist
	 * decomposition so the solve keeps the freedom it needs and loses only the
	 * freedom it was abusing.
	 *
	 * Measured against the clip's own wrist rather than the weapon: an animator
	 * already posed a hand that reads correctly, and the roll accumulates from
	 * the arm solve as much as from the palm turn, since sending the hand under
	 * the fore-end rotates the whole forearm to get it there.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float MaxWristRollDegrees = 18.0f;

	/**
	 * The most the wrist may bend between forearm and hand, degrees.
	 *
	 * The joint angle a viewer reads as a twisted hand, and the one number that
	 * describes it: measured, the untouched right wrist sits near 29 degrees
	 * through a run, while the solved left reaches 47. The clip's own wrist is
	 * kept, which is right, but that wrist was posed against the clip's weapon
	 * and worn at a position this weapon dictates it exceeds what a wrist does.
	 * Folded back about the axis it is already bending on, so the hand keeps its
	 * direction and loses only the excess.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float MaxWristBendDegrees = 30.0f;

	/**
	 * How much of the roll the solve adds at a wrist is passed down the forearm
	 * twist bones, as a fraction.
	 *
	 * These bones exist for exactly this and the source clips key them flat, so
	 * without it every degree of roll the grip needs is taken by the one span of
	 * skin between the last twist bone and the hand -- the candy wrapper. Each
	 * bone takes the share its own position along the forearm earns it, so the
	 * roll builds up from the elbow instead of arriving all at once.
	 *
	 * One is anatomical, not a tuning value: it means the forearm carries the
	 * roll the way a real one does. Zero restores the pinch.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float WristTwistShare = 0.5f;

	/** Most roll a forearm twist bone may take, degrees. Bounds an untrusted measure. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float MaxForearmTwistDegrees = 45.0f;

	/**
	 * Where the support wrist sits around the bore, degrees.
	 *
	 * Measured as atan2(z, y) about the fore-end's own centre, so 0 is out to
	 * the weapon's right, 90 is straight above and 270 straight below.
	 *
	 * 270 -- straight under the fore-end, where a support hand goes.
	 *
	 * This was 253, then 291, both picked by sweeping the angle against how far
	 * the hand had to turn. That measure was the wrong one: it counted the whole
	 * turn rather than the roll about the forearm, which is the part that reads
	 * as a broken wrist. With the palm turn off the roll is zero at any angle,
	 * so the angle is free to be the anatomically obvious one.
	 *
	 * Rolling this far broke the grip while the fingers were a constant, because
	 * the roll carried the clip's finger pose round with it. It does not now:
	 * the palm is re-aimed at the bore afterwards and the fingers re-solved
	 * against the wood, so the roll no longer has to preserve a pose it was
	 * never going to preserve.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float LeftGripBoreAngleDegrees = 270.0f;

	/**
	 * Length of the last phalanx past its own joint, cm.
	 *
	 * The distal bone is a leaf, so the skeleton has no bone to measure the
	 * fingertip from and the contact test would otherwise stop a centimetre and
	 * a half short of the actual tip.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float FingertipLength = 1.6f;

	/** Most a finger joint may be closed by the contact solve, degrees. */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float MaxGripCurlDegrees = 80.0f;

	/**
	 * How the thumb's close relates to the fingers'.
	 *
	 * Negative because it opposes them: it does not share their bend axis, and
	 * about that axis it has to travel the other way to come toward the wood.
	 * Scaled below one because a support thumb lies along a fore-end rather than
	 * wrapping under it, and a thumb solved to contact like a finger would curl
	 * it into the barrel.
	 */
	UPROPERTY(EditAnywhere, Category = "KBVE|Animation|Weapon")
	float ThumbCurlScale = -0.55f;

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
