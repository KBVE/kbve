#include "KBVEFootIKAnimInstance.h"

#include "Animation/AnimSequence.h"
#include "BonePose.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "DefaultMovementSet/CharacterMoverComponent.h"
#include "TwoBoneIK.h"

void FKBVEFootIKProxy::Initialize(UAnimInstance* InAnimInstance)
{
	FAnimInstanceProxy::Initialize(InAnimInstance);
	Sequence.SetLoopAnimation(true);
	Sequence.Initialize_AnyThread(FAnimationInitializeContext(this));
}

void FKBVEFootIKProxy::CacheBones()
{
	FAnimInstanceProxy::CacheBones();

	const FBoneContainer& Bones = GetRequiredBones();
	for (FBoneReference* Bone : {&LeftFoot, &LeftCalf, &LeftThigh, &RightFoot, &RightCalf, &RightThigh, &Pelvis, &Spine})
	{
		Bone->Initialize(Bones);
	}

	FAnimationCacheBonesContext Context(this);
	Sequence.CacheBones_AnyThread(Context);
}

void FKBVEFootIKProxy::UpdateAnimationNode(const FAnimationUpdateContext& InContext)
{
	// The context has to come from the proxy rather than be constructed here:
	// an asset player registers a tick record against the sync-group scope that
	// the engine puts on it, and asserts without one.
	Sequence.Update_AnyThread(InContext);
}

void FKBVEFootIKProxy::SolveLeg(FCSPose<FCompactPose>& Pose, const FBoneReference& Thigh,
	const FBoneReference& Calf, const FBoneReference& Foot, float VerticalOffset,
	const FVector& GroundNormal) const
{
	if (!Thigh.IsValidToEvaluate() || !Calf.IsValidToEvaluate() || !Foot.IsValidToEvaluate())
	{
		return;
	}

	FTransform ThighTransform = Pose.GetComponentSpaceTransform(Thigh.GetCompactPoseIndex(Pose.GetPose().GetBoneContainer()));
	FTransform CalfTransform = Pose.GetComponentSpaceTransform(Calf.GetCompactPoseIndex(Pose.GetPose().GetBoneContainer()));
	FTransform FootTransform = Pose.GetComponentSpaceTransform(Foot.GetCompactPoseIndex(Pose.GetPose().GetBoneContainer()));

	const FVector Effector = FootTransform.GetLocation() + FVector(0.0f, 0.0f, VerticalOffset);

	// The knee keeps pointing where the clip already put it: without a hint the
	// solver is free to fold the leg backwards.
	const FVector JointTarget = CalfTransform.GetLocation()
		+ (CalfTransform.GetLocation() - (ThighTransform.GetLocation() + FootTransform.GetLocation()) * 0.5f).GetSafeNormal() * 100.0f;

	AnimationCore::SolveTwoBoneIK(ThighTransform, CalfTransform, FootTransform, JointTarget, Effector,
		false, 1.0f, 1.0f);

	// Rolled onto the surface after the leg is solved, so the ankle keeps the
	// height the solve gave it and only the foot's orientation changes.
	if (bAlignFeetToGround && !GroundNormal.IsNearlyZero())
	{
		const FQuat ToGround = FQuat::FindBetweenNormals(FVector::UpVector, GroundNormal);
		FootTransform.SetRotation(ToGround * FootTransform.GetRotation());
	}

	const FBoneContainer& Container = Pose.GetPose().GetBoneContainer();
	Pose.SetComponentSpaceTransform(Thigh.GetCompactPoseIndex(Container), ThighTransform);
	Pose.SetComponentSpaceTransform(Calf.GetCompactPoseIndex(Container), CalfTransform);
	Pose.SetComponentSpaceTransform(Foot.GetCompactPoseIndex(Container), FootTransform);
}

bool FKBVEFootIKProxy::Evaluate(FPoseContext& Output)
{
	Sequence.Evaluate_AnyThread(Output);

	if (!bFootIKEnabled)
	{
		return true;
	}

	const FBoneContainer& Container = Output.Pose.GetBoneContainer();

	// Applied to the local pose, before component space is built: a component
	// space transform is computed per bone, so writing a new one for the pelvis
	// would leave every child -- the legs included -- exactly where it was, and
	// the drop would move nothing but the pelvis itself.
	if (Pelvis.IsValidToEvaluate() && !FMath::IsNearlyZero(PelvisOffset))
	{
		const FCompactPoseBoneIndex Index = Pelvis.GetCompactPoseIndex(Container);
		Output.Pose[Index].AddToTranslation(FVector(0.0f, 0.0f, PelvisOffset));
	}

	// The torso follows the hips down: without it the character drops at the
	// waist and the upper body rides the landing perfectly rigid.
	if (Spine.IsValidToEvaluate() && !FMath::IsNearlyZero(SpineLeanDegrees))
	{
		const FCompactPoseBoneIndex Index = Spine.GetCompactPoseIndex(Container);
		const FQuat Lean(FVector::RightVector, FMath::DegreesToRadians(SpineLeanDegrees));
		Output.Pose[Index].SetRotation(Output.Pose[Index].GetRotation() * Lean);
		Output.Pose[Index].NormalizeRotation();
	}

	FCSPose<FCompactPose> Pose;
	Pose.InitPose(Output.Pose);

	SolveLeg(Pose, LeftThigh, LeftCalf, LeftFoot, LeftFootOffset - PelvisOffset, LeftFootNormal);
	SolveLeg(Pose, RightThigh, RightCalf, RightFoot, RightFootOffset - PelvisOffset, RightFootNormal);

	FCSPose<FCompactPose>::ConvertComponentPosesToLocalPoses(MoveTemp(Pose), Output.Pose);
	return true;
}

FVector UKBVEFootIKAnimInstance::ClampNormalToTilt(const FVector& Normal) const
{
	const FVector Safe = Normal.GetSafeNormal();
	if (Safe.IsNearlyZero())
	{
		return FVector::UpVector;
	}

	// A near-vertical face under a foot would otherwise lay the foot on its
	// side, so the roll is capped and the foot stays plausible.
	const float Angle = FMath::Acos(FMath::Clamp(Safe | FVector::UpVector, -1.0f, 1.0f));
	const float MaxAngle = FMath::DegreesToRadians(MaxFootTilt);
	if (Angle <= MaxAngle)
	{
		return Safe;
	}

	const FVector Axis = (FVector::UpVector ^ Safe).GetSafeNormal();
	return Axis.IsNearlyZero() ? FVector::UpVector : FQuat(Axis, MaxAngle).RotateVector(FVector::UpVector);
}

void UKBVEFootIKAnimInstance::SetLocomotionClip(UAnimSequence* Clip, float PlayRate)
{
	PendingClip = Clip;
	PendingPlayRate = PlayRate;
}

bool UKBVEFootIKAnimInstance::TraceGroundUnderFoot(const FName& FootBone, float FallbackZ,
	float& OutGroundZ, FVector& OutNormal) const
{
	const USkeletalMeshComponent* Mesh = GetSkelMeshComponent();
	const UWorld* World = Mesh ? Mesh->GetWorld() : nullptr;
	if (!World)
	{
		return false;
	}

	const FVector FootWorld = Mesh->GetSocketLocation(FootBone);
	const FVector Start(FootWorld.X, FootWorld.Y, FallbackZ + TraceAboveFoot);
	const FVector End(FootWorld.X, FootWorld.Y, FallbackZ - TraceBelowFoot);

	FCollisionQueryParams Params;
	if (const AActor* Owner = Mesh->GetOwner())
	{
		Params.AddIgnoredActor(Owner);
	}

	FHitResult Hit;
	if (World->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
	{
		OutGroundZ = Hit.Location.Z;
		return true;
	}
	return false;
}

void UKBVEFootIKAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
	Super::NativeUpdateAnimation(DeltaSeconds);

	const USkeletalMeshComponent* Mesh = GetSkelMeshComponent();
	if (!Mesh)
	{
		return;
	}

	// Feet in the air have no ground to be placed on, so the whole solve fades
	// out on takeoff and back in on landing rather than snapping: held through
	// a jump it pulls the pelvis toward ground that is metres below, which
	// reads as the character arching or hopping a second time.
	const UCharacterMoverComponent* Mover = Mesh->GetOwner()
		? Mesh->GetOwner()->FindComponentByClass<UCharacterMoverComponent>()
		: nullptr;
	const bool bAirborne = Mover && Mover->IsAirborne();
	const float BlendStep = AirborneBlendTime > KINDA_SMALL_NUMBER ? DeltaSeconds / AirborneBlendTime : 1.0f;
	GroundedAlpha = FMath::Clamp(GroundedAlpha + (bAirborne ? -BlendStep : BlendStep), 0.0f, 1.0f);

	// Landing absorption. The impact speed has to be remembered from the last
	// airborne frame: by the time the mover reports ground the vertical speed
	// has already been zeroed, so reading it on the landing frame reads zero.
	const float SpeedZ = Mover ? Mover->GetVelocity().Z : 0.0f;
	if (bAirborne)
	{
		LastAirborneSpeedZ = SpeedZ;
	}
	else if (bWasAirborne && bAbsorbLandings)
	{
		const float ImpactSpeed = FMath::Max(0.0f, -LastAirborneSpeedZ);
		if (ImpactSpeed > LandingSpeedThreshold)
		{
			LandingDipVelocity -= (ImpactSpeed - LandingSpeedThreshold) * LandingDipPerSpeed;
		}
	}
	bWasAirborne = bAirborne;

	// A damped spring rather than a curve, so any impact speed produces a dip
	// that settles instead of a fixed animation that does not match the fall.
	const float SpringAccel = (-LandingSpringStiffness * LandingDip) - (LandingSpringDamping * LandingDipVelocity);
	LandingDipVelocity += SpringAccel * DeltaSeconds;
	LandingDip = FMath::Clamp(LandingDip + LandingDipVelocity * DeltaSeconds, -MaxLandingDip, 0.0f);
	if (FMath::IsNearlyZero(LandingDip, 0.01f) && FMath::Abs(LandingDipVelocity) < 0.1f)
	{
		LandingDip = 0.0f;
		LandingDipVelocity = 0.0f;
	}

	// Traces belong on the game thread; the proxy only consumes the results.
	float LeftTarget = 0.0f;
	float RightTarget = 0.0f;
	FVector LeftNormalTarget = FVector::UpVector;
	FVector RightNormalTarget = FVector::UpVector;
	if (bEnableFootIK && GroundedAlpha > KINDA_SMALL_NUMBER)
	{
		const float RootZ = Mesh->GetComponentLocation().Z;

		// Measured against the mesh root rather than the ground under it, and
		// the difference is not cosmetic: the root sits at the capsule bottom,
		// which the mover holds a floor tolerance above the ground. Referencing
		// the ground would preserve that gap and leave the whole character --
		// feet included -- hovering by it. Referencing the root absorbs it.
		//
		// Corrected by ground position rather than by where the foot currently
		// is, because the foot already carries last frame's correction and
		// measuring against it would feed back and oscillate.
		float GroundZ = 0.0f;
		FVector Normal = FVector::UpVector;
		if (TraceGroundUnderFoot(LeftFootBone, RootZ, GroundZ, Normal))
		{
			LeftTarget = FMath::Clamp(GroundZ - RootZ + FootHeightTrim, -MaxFootLift, MaxFootLift);
			LeftNormalTarget = ClampNormalToTilt(Normal);
		}
		Normal = FVector::UpVector;
		if (TraceGroundUnderFoot(RightFootBone, RootZ, GroundZ, Normal))
		{
			RightTarget = FMath::Clamp(GroundZ - RootZ + FootHeightTrim, -MaxFootLift, MaxFootLift);
			RightNormalTarget = ClampNormalToTilt(Normal);
		}
	}

	// Only ever drops: raising the pelvis would lift the grounded foot off the
	// surface it is standing on.
	const float PelvisTarget = FMath::Min(0.0f, FMath::Min(LeftTarget, RightTarget));

	SmoothedLeft = FMath::FInterpConstantTo(SmoothedLeft, LeftTarget, DeltaSeconds, InterpSpeed);
	SmoothedRight = FMath::FInterpConstantTo(SmoothedRight, RightTarget, DeltaSeconds, InterpSpeed);
	SmoothedPelvis = FMath::FInterpConstantTo(SmoothedPelvis, PelvisTarget, DeltaSeconds, InterpSpeed);

	const float TiltStep = FMath::DegreesToRadians(TiltInterpSpeed) * DeltaSeconds;
	SmoothedLeftNormal = FMath::VInterpNormalRotationTo(SmoothedLeftNormal, LeftNormalTarget, DeltaSeconds, TiltInterpSpeed);
	SmoothedRightNormal = FMath::VInterpNormalRotationTo(SmoothedRightNormal, RightNormalTarget, DeltaSeconds, TiltInterpSpeed);

	// Component space, because the pose the proxy rolls is in component space
	// and the trace normal is in world space.
	const FTransform MeshTransform = Mesh->GetComponentTransform();

	FKBVEFootIKProxy& Proxy = GetProxyOnGameThread<FKBVEFootIKProxy>();
	Proxy.bFootIKEnabled = bEnableFootIK && GroundedAlpha > KINDA_SMALL_NUMBER;
	Proxy.LeftFootOffset = SmoothedLeft * GroundedAlpha;
	Proxy.RightFootOffset = SmoothedRight * GroundedAlpha;
	// The dip rides on top of the terrain adaptation: the feet are solved
	// against this same offset, so they stay planted while the hips drop and
	// the knees take the landing.
	Proxy.PelvisOffset = (SmoothedPelvis + LandingDip) * GroundedAlpha;
	Proxy.Spine.BoneName = SpineBone;
	Proxy.SpineLeanDegrees = MaxLandingDip > KINDA_SMALL_NUMBER
		? (LandingDip / MaxLandingDip) * LandingSpineLean * GroundedAlpha
		: 0.0f;
	Proxy.bAlignFeetToGround = bAlignFeetToGround;
	const FVector LeftLocalNormal = MeshTransform.InverseTransformVectorNoScale(SmoothedLeftNormal).GetSafeNormal();
	const FVector RightLocalNormal = MeshTransform.InverseTransformVectorNoScale(SmoothedRightNormal).GetSafeNormal();
	Proxy.LeftFootNormal = FMath::Lerp(FVector::UpVector, LeftLocalNormal, GroundedAlpha).GetSafeNormal();
	Proxy.RightFootNormal = FMath::Lerp(FVector::UpVector, RightLocalNormal, GroundedAlpha).GetSafeNormal();
	Proxy.LeftFoot.BoneName = LeftFootBone;
	Proxy.LeftCalf.BoneName = LeftCalfBone;
	Proxy.LeftThigh.BoneName = LeftThighBone;
	Proxy.RightFoot.BoneName = RightFootBone;
	Proxy.RightCalf.BoneName = RightCalfBone;
	Proxy.RightThigh.BoneName = RightThighBone;
	Proxy.Pelvis.BoneName = PelvisBone;

	if (PendingClip && Proxy.Sequence.GetSequence() != PendingClip)
	{
		Proxy.Sequence.SetSequence(PendingClip);
	}
	Proxy.Sequence.SetPlayRate(PendingPlayRate);
}
