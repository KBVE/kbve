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

	/** The clip to play, and how fast. Written from the game thread. */
	FAnimNode_SequencePlayer Sequence;

	/** Names resolved once in CacheBones; empty names disable that leg. */
	FBoneReference LeftFoot;
	FBoneReference LeftCalf;
	FBoneReference LeftThigh;
	FBoneReference RightFoot;
	FBoneReference RightCalf;
	FBoneReference RightThigh;
	FBoneReference Pelvis;

	/** Vertical corrections in component space, already smoothed. */
	float LeftFootOffset = 0.0f;
	float RightFootOffset = 0.0f;
	float PelvisOffset = 0.0f;
	bool bFootIKEnabled = false;

	/** Ground normals under each foot, in component space, already smoothed. */
	FVector LeftFootNormal = FVector::UpVector;
	FVector RightFootNormal = FVector::UpVector;
	bool bAlignFeetToGround = true;

private:
	/** Solve one leg so its foot reaches its ground point, and lies along it. */
	void SolveLeg(FCSPose<FCompactPose>& Pose, const FBoneReference& Thigh, const FBoneReference& Calf,
		const FBoneReference& Foot, float VerticalOffset, const FVector& GroundNormal) const;
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
};
