#include "KBVEFootIKAnimInstance.h"

#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "BonePose.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "DefaultMovementSet/CharacterMoverComponent.h"
#include "TwoBoneIK.h"
#include "HAL/IConsoleManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEFootIK, Display, All);

namespace
{
	// Landing absorption is a few frames long and easy to mistake for nothing
	// happening, so the numbers are available rather than left to the eye.
	static int32 GKBVELogLandings = 0;
	// Continuous per-frame foot state, as CSV in the log. A planted foot should
	// have no horizontal world velocity at all, so the slide column is the
	// measurement that says whether the feet shuffle rather than an impression.
	static int32 GKBVETraceFeet = 0;
	static FAutoConsoleVariableRef CVarKBVETraceFeet(
		TEXT("kbve.FootIK.TraceFeet"),
		GKBVETraceFeet,
		TEXT("Log per-frame foot position, lock state and slide speed as CSV."));

	static FAutoConsoleVariableRef CVarKBVELogLandings(
		TEXT("kbve.FootIK.LogLandings"),
		GKBVELogLandings,
		TEXT("Log impact speed and the hip dip it produces, frame by frame."));
}

void FKBVEFootIKProxy::Initialize(UAnimInstance* InAnimInstance)
{
	FAnimInstanceProxy::Initialize(InAnimInstance);
	SequenceA.SetLoopAnimation(true);
	SequenceB.SetLoopAnimation(true);
	SequenceA.Initialize_AnyThread(FAnimationInitializeContext(this));
	SequenceB.Initialize_AnyThread(FAnimationInitializeContext(this));
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
	SequenceA.CacheBones_AnyThread(Context);
	SequenceB.CacheBones_AnyThread(Context);
}

void FKBVEFootIKProxy::UpdateAnimationNode(const FAnimationUpdateContext& InContext)
{
	// Swapped here rather than on the game thread so the outgoing pose is still
	// the one that was being played when the change arrived.
	if (RequestedClip && CurrentPlayer().GetSequence() != RequestedClip)
	{
		const bool bFirstClip = CurrentPlayer().GetSequence() == nullptr;
		bUsingA = !bUsingA;
		CurrentPlayer().SetSequence(RequestedClip);
		BlendAlpha = (bFirstClip || ClipBlendTime <= KINDA_SMALL_NUMBER) ? 1.0f : 0.0f;
	}
	CurrentPlayer().SetPlayRate(RequestedPlayRate);

	if (BlendAlpha < 1.0f)
	{
		BlendAlpha = FMath::Clamp(BlendAlpha + InContext.GetDeltaTime() / FMath::Max(ClipBlendTime, KINDA_SMALL_NUMBER), 0.0f, 1.0f);
	}

	// The context has to come from the proxy rather than be constructed here:
	// an asset player registers a tick record against the sync-group scope that
	// the engine puts on it, and asserts without one.
	CurrentPlayer().Update_AnyThread(InContext);
	if (BlendAlpha < 1.0f)
	{
		// Kept ticking while it fades out, so the outgoing clip keeps moving
		// rather than freezing on the frame the change landed.
		PreviousPlayer().Update_AnyThread(InContext.FractionalWeight(1.0f - BlendAlpha));
	}
}

void FKBVEFootIKProxy::SolveLeg(FCSPose<FCompactPose>& Pose, const FBoneReference& Thigh,
	const FBoneReference& Calf, const FBoneReference& Foot, const FVector& Correction,
	const FVector& GroundNormal) const
{
	if (!Thigh.IsValidToEvaluate() || !Calf.IsValidToEvaluate() || !Foot.IsValidToEvaluate())
	{
		return;
	}

	FTransform ThighTransform = Pose.GetComponentSpaceTransform(Thigh.GetCompactPoseIndex(Pose.GetPose().GetBoneContainer()));
	FTransform CalfTransform = Pose.GetComponentSpaceTransform(Calf.GetCompactPoseIndex(Pose.GetPose().GetBoneContainer()));
	FTransform FootTransform = Pose.GetComponentSpaceTransform(Foot.GetCompactPoseIndex(Pose.GetPose().GetBoneContainer()));

	const FVector Effector = FootTransform.GetLocation() + Correction;

	// The knee keeps pointing where the clip already put it, but that direction
	// degenerates exactly when the leg straightens: a straight leg puts the knee
	// on the line between hip and ankle, the offset collapses to nothing, and a
	// normalised zero leaves the solver to pick a knee direction on its own --
	// which it then picks differently from one frame to the next. A straight leg
	// is the landing and idle pose, so it shows up as the leg snapping. Below a
	// usable length the hint falls back to bending the knee forwards, which is
	// the only direction a human knee bends.
	const FVector HipToAnkle = FootTransform.GetLocation() - ThighTransform.GetLocation();
	FVector KneeDirection = CalfTransform.GetLocation()
		- (ThighTransform.GetLocation() + FootTransform.GetLocation()) * 0.5f;

	// Measured against the leg it belongs to, so the test means the same thing
	// on any character regardless of scale.
	const float KneeDirectionLength = KneeDirection.Size();
	const float MinimumHint = FMath::Max(1.0f, HipToAnkle.Size() * 0.02f);
	if (KneeDirectionLength < MinimumHint)
	{
		KneeDirection = FVector::ForwardVector;
	}
	else
	{
		KneeDirection /= KneeDirectionLength;
	}

	const FVector JointTarget = CalfTransform.GetLocation() + KneeDirection * 100.0f;

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
	if (BlendAlpha >= 1.0f)
	{
		CurrentPlayer().Evaluate_AnyThread(Output);
	}
	else
	{
		FPoseContext Incoming(this);
		FPoseContext Outgoing(this);
		CurrentPlayer().Evaluate_AnyThread(Incoming);
		PreviousPlayer().Evaluate_AnyThread(Outgoing);
		FAnimationRuntime::BlendTwoPosesTogether(Incoming.Pose, Outgoing.Pose, Incoming.Curve, Outgoing.Curve,
			BlendAlpha, Output.Pose, Output.Curve);
	}

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

	// Weighted by how high the clip has lifted each foot, measured on the pose
	// before any correction is applied so it cannot feed back on itself. A foot
	// in stance takes the full solve; a foot swinging forward is left alone.
	auto SwingWeight = [this, &Pose, &Container](const FBoneReference& Foot) -> float
	{
		if (!Foot.IsValidToEvaluate() || SwingHeight <= StanceHeight)
		{
			return 1.0f;
		}
		const float Height = Pose.GetComponentSpaceTransform(Foot.GetCompactPoseIndex(Container)).GetLocation().Z;
		return 1.0f - FMath::SmoothStep(StanceHeight, SwingHeight, Height);
	};

	const float LeftWeight = SwingWeight(LeftFoot);
	const float RightWeight = SwingWeight(RightFoot);

	SolveLeg(Pose, LeftThigh, LeftCalf, LeftFoot,
		LeftFootCorrection * LeftWeight - FVector(0.0f, 0.0f, PelvisOffset), LeftFootNormal);
	SolveLeg(Pose, RightThigh, RightCalf, RightFoot,
		RightFootCorrection * RightWeight - FVector(0.0f, 0.0f, PelvisOffset), RightFootNormal);

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

FVector UKBVEFootIKAnimInstance::UpdateFootLock(FFootLock& Lock, const FName& FootBone, float RootZ,
	bool bGrounded, float AppliedAlpha, float DeltaSeconds) const
{
	const USkeletalMeshComponent* Mesh = GetSkelMeshComponent();
	if (!Mesh)
	{
		return FVector::ZeroVector;
	}

	// The socket already carries this frame's IK correction, so it is compared
	// to the ground as-is. Adding the vertical offset on top double-counts it,
	// which put the two feet at different apparent heights from an identical
	// stance -- one locking almost always and the other almost never.
	const FVector Foot = Mesh->GetSocketLocation(FootBone);

	// Where the clip alone would put the foot. The lock correction has to be
	// taken back out before the error is measured, because the socket includes
	// it: an error read straight off the socket is one the correction has
	// already cancelled, so the target becomes (E - C) while the state is C and
	// each step moves the target twice as far as the interpolation closes it.
	// There is no reachable fixed point, and the leg buzzes at LockBlendSpeed
	// -- about seven centimetres a frame -- for as long as the foot is planted.
	const FVector ClipFoot = Foot - Lock.Correction * AppliedAlpha;

	float GroundZ = RootZ;
	FVector Unused = FVector::UpVector;
	TraceGroundUnderFoot(FootBone, RootZ, GroundZ, Unused);

	// Planted means low. A clip lifting the foot to swing it forward carries it
	// above this, which is what releases the lock.
	const bool bPlanted = bGrounded && bLockPlantedFeet && (Foot.Z - GroundZ) <= PlantGapHeight;

	if (bPlanted && !Lock.bLocked)
	{
		Lock.Position = Foot;
		Lock.bLocked = true;
	}
	else if (!bPlanted)
	{
		Lock.bLocked = false;
	}

	// Released rather than dragged when the body has moved on: holding past
	// this stretches the leg into a pose no step would produce.
	FVector Target = FVector::ZeroVector;
	if (Lock.bLocked)
	{
		// Horizontal only. Height is already the terrain adaptation's job, and
		// pinning it too holds the foot at whatever height it was captured at
		// while the body settles away from it, which lifts the foot back off
		// the ground the rest of the solve just put it on.
		const FVector ToLock(Lock.Position.X - ClipFoot.X, Lock.Position.Y - ClipFoot.Y, 0.0f);
		if (ToLock.Size() > MaxLockDistance)
		{
			Lock.bLocked = false;
		}
		else
		{
			Target = ToLock;
		}
	}

	// Eased in and out so a foot releasing does not snap back to the clip.
	Lock.Correction = FMath::VInterpConstantTo(Lock.Correction, Target, DeltaSeconds, LockBlendSpeed);
	return Lock.Correction;
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
	const float BlendSeconds = bAirborne ? AirborneBlendTime : LandingBlendTime;
	const float BlendStep = BlendSeconds > KINDA_SMALL_NUMBER ? DeltaSeconds / BlendSeconds : 1.0f;
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
			LandingTraceFrames = 20;
			if (GKBVELogLandings)
			{
				// Damping cuts the peak well below v/omega, so the estimate
				// carries the damping ratio rather than flattering itself.
				const float Omega = FMath::Sqrt(FMath::Max(LandingSpringStiffness, KINDA_SMALL_NUMBER));
				const float Zeta = LandingSpringDamping / (2.0f * Omega);
				const float Peak = Zeta < 1.0f
					? (FMath::Abs(LandingDipVelocity) / Omega)
						* FMath::Exp(-Zeta * FMath::Acos(Zeta) / FMath::Sqrt(1.0f - Zeta * Zeta))
					: FMath::Abs(LandingDipVelocity) / Omega;
				UE_LOG(LogKBVEFootIK, Display,
					TEXT("landing: impact=%.0f cm/s ground=%.0f cm/s -> dipVelocity=%.1f (zeta=%.2f peak %.1f cm)"),
					ImpactSpeed, Mover ? Mover->GetVelocity().Size2D() : 0.0f,
					LandingDipVelocity, Zeta, Peak);
			}
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

	if (GKBVELogLandings && !FMath::IsNearlyZero(LandingDip))
	{
		UE_LOG(LogKBVEFootIK, Display, TEXT("landing: dip=%.2f cm vel=%.1f alpha=%.2f"),
			LandingDip, LandingDipVelocity, GroundedAlpha);
	}

	// Traces belong on the game thread; the proxy only consumes the results.
	float LeftTarget = 0.0f;
	float RightTarget = 0.0f;
	FVector LeftNormalTarget = FVector::UpVector;
	FVector RightNormalTarget = FVector::UpVector;
	// Traced even while airborne, and this matters on landing: gating the traces
	// on the blend let both targets decay to zero in the air, so at touchdown
	// each foot had to travel its whole correction at the interpolation speed
	// and visibly slid into place -- worst on whichever foot was furthest from
	// the ground. Tracing throughout means the targets are already right when
	// the blend fades them in.
	if (bEnableFootIK)
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

	// A burst after touchdown, because the snap is a few frames long: where each
	// foot actually is, what the solve is asking of it, and how far through the
	// clip blend we are, so a leg swept by the crossfade can be told apart from
	// a leg moved by the IK.
	if (GKBVELogLandings && LandingTraceFrames > 0)
	{
		--LandingTraceFrames;
		const FVector FootL = Mesh->GetSocketLocation(LeftFootBone);
		const FVector FootR = Mesh->GetSocketLocation(RightFootBone);
		UE_LOG(LogKBVEFootIK, Display,
			TEXT("post-land: L=(%.0f,%.0f,%.1f) off=%.1f->%.1f  R=(%.0f,%.0f,%.1f) off=%.1f->%.1f  alpha=%.2f dip=%.1f"),
			FootL.X, FootL.Y, FootL.Z, SmoothedLeft, LeftTarget,
			FootR.X, FootR.Y, FootR.Z, SmoothedRight, RightTarget,
			GroundedAlpha, LandingDip);
	}

	// Vertical terrain adaptation first, then the horizontal lock on top. The
	// blend the corrections are applied at is passed in so the lock can subtract
	// what it already contributed to the socket it is about to read back.
	const float RootZ = Mesh->GetComponentLocation().Z;
	const FVector LeftLockCorrection = UpdateFootLock(LeftLock, LeftFootBone, RootZ, !bAirborne, GroundedAlpha, DeltaSeconds);
	const FVector RightLockCorrection = UpdateFootLock(RightLock, RightFootBone, RootZ, !bAirborne, GroundedAlpha, DeltaSeconds);

	if (GKBVETraceFeet)
	{
		const FVector FootL = Mesh->GetSocketLocation(LeftFootBone);
		const FVector FootR = Mesh->GetSocketLocation(RightFootBone);
		const float Inv = DeltaSeconds > KINDA_SMALL_NUMBER ? 1.0f / DeltaSeconds : 0.0f;
		const float SlideL = bHasLastFeet ? (FootL - LastLeftFoot).Size2D() * Inv : 0.0f;
		const float SlideR = bHasLastFeet ? (FootR - LastRightFoot).Size2D() * Inv : 0.0f;

		// Contact is judged from the foot's own ground, not the character's, so
		// a foot on a step reads as planted when it is.
		float GroundL = 0.0f, GroundR = 0.0f;
		FVector Ignored = FVector::UpVector;
		TraceGroundUnderFoot(LeftFootBone, RootZ, GroundL, Ignored);
		TraceGroundUnderFoot(RightFootBone, RootZ, GroundR, Ignored);

		UE_LOG(LogKBVEFootIK, Display,
			TEXT("footcsv,%.3f,%.0f,%d,%.2f,%.1f,%.1f,%.1f,%d,%.1f,%.1f,%.1f,%.1f,%d,%.1f"),
			GetWorld() ? GetWorld()->GetTimeSeconds() : 0.0f,
			Mover ? Mover->GetVelocity().Size2D() : 0.0f, bAirborne ? 1 : 0, GroundedAlpha,
			FootL.Z, GroundL, FootL.Z - GroundL, LeftLock.bLocked ? 1 : 0, SlideL,
			FootR.Z, GroundR, FootR.Z - GroundR, RightLock.bLocked ? 1 : 0, SlideR);

		LastLeftFoot = FootL;
		LastRightFoot = FootR;
		bHasLastFeet = true;
	}

	FKBVEFootIKProxy& Proxy = GetProxyOnGameThread<FKBVEFootIKProxy>();
	Proxy.bFootIKEnabled = bEnableFootIK && GroundedAlpha > KINDA_SMALL_NUMBER;
	Proxy.LeftFootOffset = SmoothedLeft * GroundedAlpha;
	Proxy.RightFootOffset = SmoothedRight * GroundedAlpha;

	// The lock is world space; the solve works in component space.
	const FTransform MeshToWorld = Mesh->GetComponentTransform();
	Proxy.LeftFootCorrection = FVector(0.0f, 0.0f, SmoothedLeft * GroundedAlpha)
		+ MeshToWorld.InverseTransformVectorNoScale(LeftLockCorrection * GroundedAlpha);
	Proxy.RightFootCorrection = FVector(0.0f, 0.0f, SmoothedRight * GroundedAlpha)
		+ MeshToWorld.InverseTransformVectorNoScale(RightLockCorrection * GroundedAlpha);
	// Only the terrain adaptation fades with the grounded blend. The landing
	// dip must not: the blend ramps in over the same frames the dip is at its
	// deepest, so scaling it there cancels most of the absorption exactly when
	// it should read hardest. The feet are solved against this same combined
	// offset, so they stay planted while the hips drop and the knees take it.
	Proxy.PelvisOffset = SmoothedPelvis * GroundedAlpha + LandingDip;
	Proxy.Spine.BoneName = SpineBone;
	Proxy.SpineLeanDegrees = MaxLandingDip > KINDA_SMALL_NUMBER
		? (LandingDip / MaxLandingDip) * LandingSpineLean
		: 0.0f;
	Proxy.bAlignFeetToGround = bAlignFeetToGround;
	Proxy.StanceHeight = StanceHeight;
	Proxy.SwingHeight = SwingHeight;
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

	if (GKBVELogLandings && PendingClip != LastLoggedClip)
	{
		UE_LOG(LogKBVEFootIK, Display, TEXT("clip: %s -> %s (rate %.2f, ground %.0f cm/s, airborne %d)"),
			LastLoggedClip ? *LastLoggedClip->GetName() : TEXT("none"),
			PendingClip ? *PendingClip->GetName() : TEXT("none"),
			PendingPlayRate, Mover ? Mover->GetVelocity().Size2D() : 0.0f, bAirborne ? 1 : 0);
		LastLoggedClip = PendingClip;
	}

	Proxy.RequestedClip = PendingClip;
	Proxy.RequestedPlayRate = PendingPlayRate;
	Proxy.ClipBlendTime = ClipBlendTime;
}
