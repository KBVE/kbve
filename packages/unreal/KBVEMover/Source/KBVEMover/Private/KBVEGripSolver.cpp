#include "KBVEFootIKAnimInstance.h"

#include "KBVEGripInternal.h"
#include "KBVEWeaponGrip.h"

#include "Animation/AnimSequence.h"
#include "Animation/AnimationPoseData.h"
#include "AnimationRuntime.h"
#include "BonePose.h"
#include "TwoBoneIK.h"

using namespace KBVEGrip;

namespace
{
	// How far a point lies outside the fore-end, in cm, negative inside it. The
	// section is an ellipse rather than a circle -- a rifle's fore-end is a
	// block under the barrel, taller than it is wide -- so the point is measured
	// in the section's own units and then put back into centimetres.
	FORCEINLINE float SectionClearance(const FVector& Point, const FVector& Origin, const FVector& AxisX,
		const FVector& AxisY, const FVector& AxisZ, float HalfWidth, float HalfHeight)
	{
		const FVector Delta = Point - Origin;
		const FVector Flat = Delta - AxisX * (Delta | AxisX);
		const float U = (Flat | AxisY) / FMath::Max(HalfWidth, KINDA_SMALL_NUMBER);
		const float V = (Flat | AxisZ) / FMath::Max(HalfHeight, KINDA_SMALL_NUMBER);
		return (FMath::Sqrt(U * U + V * V) - 1.0f) * FMath::Min(HalfWidth, HalfHeight);
	}

	// Distance from that same centre out to the surface, along an angle measured
	// as atan2(z, y). Used to place the wrist rather than state where it goes.
	FORCEINLINE float SectionRadius(float Degrees, float HalfWidth, float HalfHeight)
	{
		const float Radians = FMath::DegreesToRadians(Degrees);
		const float C = FMath::Cos(Radians) / FMath::Max(HalfWidth, KINDA_SMALL_NUMBER);
		const float S = FMath::Sin(Radians) / FMath::Max(HalfHeight, KINDA_SMALL_NUMBER);
		return 1.0f / FMath::Max(FMath::Sqrt(C * C + S * S), KINDA_SMALL_NUMBER);
	}
}

void FKBVEFootIKProxy::SampleGripPose(const FBoneContainer& Container)
{
	if (bGripPoseSampled || LeftFingers.Num() == 0)
	{
		return;
	}

	// Angles win over a posed asset when they are given. Built over the
	// reference pose rather than the clip, so the hold is the same shape
	// whether the character is walking, idling or landing -- a grip that
	// changed with the locomotion would not be a grip.
	if (GripFingerAngles.Num() == LeftFingers.Num())
	{
		bGripPoseSampled = true;
		const FVector CurlAxis = FingerCurlAxis.GetSafeNormal();
		GripPoseLocals.Reset();
		GripPoseLocals.Reserve(LeftFingers.Num());
		for (int32 Index = 0; Index < LeftFingers.Num(); ++Index)
		{
			const FBoneReference& Finger = LeftFingers[Index];
			if (!Finger.IsValidToEvaluate())
			{
				GripPoseLocals.Add(FTransform::Identity);
				continue;
			}
			FTransform Local = Container.GetRefPoseTransform(Finger.GetCompactPoseIndex(Container));
			const FQuat Curl(CurlAxis, FMath::DegreesToRadians(GripFingerAngles[Index]));
			Local.SetRotation((Local.GetRotation() * Curl).GetNormalized());
			GripPoseLocals.Add(Local);
		}
		UE_LOG(LogKBVEFootIK, Display, TEXT("grip: built support-hand pose from %d authored joint angles"),
			GripFingerAngles.Num());
		return;
	}

	if (!SupportHandPose)
	{
		return;
	}
	bGripPoseSampled = true;
	UE_LOG(LogKBVEFootIK, Display, TEXT("grip: sampling support-hand pose %s at %.2fs"),
		*SupportHandPose->GetName(), SupportHandPoseTime);

	// One evaluation, kept. Everything below the wrist in the authored pose is
	// wanted and nothing above it is: the pose supplies fingers, the solver
	// supplies where the hand is and which way it faces.
	FCompactPose PosePose;
	PosePose.SetBoneContainer(&Container);
	FBlendedCurve Curve;
	UE::Anim::FStackAttributeContainer Attributes;
	FAnimationPoseData PoseData(PosePose, Curve, Attributes);

	FAnimExtractContext Context(static_cast<double>(SupportHandPoseTime), false);
	SupportHandPose->GetAnimationPose(PoseData, Context);

	GripPoseLocals.Reset();
	GripPoseLocals.Reserve(LeftFingers.Num());
	for (const FBoneReference& Finger : LeftFingers)
	{
		GripPoseLocals.Add(Finger.IsValidToEvaluate()
			? PosePose[Finger.GetCompactPoseIndex(Container)]
			: FTransform::Identity);
	}
}

void FKBVEFootIKProxy::SolveGrip(FCSPose<FCompactPose>& Pose, const FTransform& WeaponTransform,
	TArray<float>& OutCurlDegrees) const
{
	OutCurlDegrees.Reset();
	if (!LeftHand.IsValidToEvaluate() || !LeftUpperArm.IsValidToEvaluate() || !LeftLowerArm.IsValidToEvaluate())
	{
		return;
	}
	if (FingersPerHand <= 0 || LeftFingers.Num() < FingersPerHand)
	{
		return;
	}

	const FBoneContainer& Container = Pose.GetPose().GetBoneContainer();
	const FVector CurlAxis = FingerCurlAxis.GetSafeNormal();
	if (CurlAxis.IsNearlyZero())
	{
		return;
	}

	const int32 ChainCount = LeftFingers.Num() / FingersPerHand;

	// The wrist is placed from the weapon's own section rather than rolled from
	// where the clip left it. Under the fore-end at the stated angle, out by the
	// distance to the surface there plus the thickness of a hand -- so a thicker
	// or thinner weapon moves the wrist on its own.
	// Where along the wood to take hold, chosen for this frame rather than
	// stated once. The rifle moves with the clip, so the point that is a
	// comfortable reach now is at arm's length a moment later; the hand slides
	// along the fore-end instead, which is what a support hand does anyway.
	float AlongBarrel = GripAlongBarrel;
	if (GripArmExtension > KINDA_SMALL_NUMBER)
	{
		const FVector Shoulder =
			Pose.GetComponentSpaceTransform(LeftUpperArm.GetCompactPoseIndex(Container)).GetLocation();
		const FVector Elbow =
			Pose.GetComponentSpaceTransform(LeftLowerArm.GetCompactPoseIndex(Container)).GetLocation();
		const FVector Wrist =
			Pose.GetComponentSpaceTransform(LeftHand.GetCompactPoseIndex(Container)).GetLocation();
		const float Wanted = ((Elbow - Shoulder).Size() + (Wrist - Elbow).Size()) * GripArmExtension;

		// Sampled rather than bisected. Distance to the shoulder is not monotone
		// along the barrel -- which way it runs depends on how the clip is
		// holding the rifle -- and a bisection told otherwise picks an end and
		// is confidently wrong. Twelve samples across the woodwork is cheap and
		// makes no assumption at all.
		const float SeatOut =
			SectionRadius(GripBoreAngleDegrees, ForeEndHalfWidth, ForeEndHalfHeight) + GripKnuckleClearance;
		const float GripRadiansLocal = FMath::DegreesToRadians(GripBoreAngleDegrees);
		const FVector SeatDir(0.0f, FMath::Cos(GripRadiansLocal), FMath::Sin(GripRadiansLocal));

		float Best = TNumericLimits<float>::Max();
		for (int32 Sample = 0; Sample <= 12; ++Sample)
		{
			const float Along = FMath::Lerp(GripAlongMin, GripAlongMax, Sample / 12.0f);

			// The point the arm is actually sent to, not the middle of the wood:
			// the wrist sits a hand's thickness outside the section, and picking
			// a hold by where its centre is lands the real target out of reach.
			const FVector Seat = FVector(Along, 0.0f, ForeEndCentreHeight) + SeatDir * SeatOut;
			const float Distance = (WeaponTransform.TransformPosition(Seat) - Shoulder).Size();
			const float Cost = FMath::Abs(Distance - Wanted);
			if (Cost < Best)
			{
				Best = Cost;
				AlongBarrel = Along;
			}
		}
	}

	const FVector GripOriginLocal(AlongBarrel, 0.0f, ForeEndCentreHeight);
	const float GripRadians = FMath::DegreesToRadians(GripBoreAngleDegrees);
	const FVector GripDirLocal(0.0f, FMath::Cos(GripRadians), FMath::Sin(GripRadians));
	float Reach = SectionRadius(GripBoreAngleDegrees, ForeEndHalfWidth, ForeEndHalfHeight) + GripWristOffset;
	FVector TargetComponent = WeaponTransform.TransformPosition(GripOriginLocal + GripDirLocal * Reach);

	// The wrist as the clip authored it, kept before anything moves the arm. It
	// is the reference the roll is measured against: an animator posed a hand
	// that reads as a hand, and however far the solve turns it, it should not
	// roll far from that.
	const FQuat ClipHandRotation =
		Pose.GetComponentSpaceTransform(LeftHand.GetCompactPoseIndex(Container)).GetRotation();

	// And the same wrist in the frame that actually shows: the hand relative to
	// its own forearm. Component space flatters the solve -- keep a hand's world
	// rotation while the arm swings under the weapon and it reads as zero change
	// while the joint itself has turned by however far the forearm went.
	const FQuat ClipWristLocal =
		Pose.GetLocalSpaceTransform(LeftHand.GetCompactPoseIndex(Container)).GetRotation();


	SolveArm(Pose, LeftUpperArm, LeftLowerArm, LeftHand, TargetComponent, LeftElbowDirection,
		FQuat::Identity, LeftHandIKAlpha, 0.0f);

	// The fore-end, where the pose lives.
	const FVector AxisOrigin = WeaponTransform.TransformPosition(GripOriginLocal);
	const FQuat WeaponRotation = WeaponTransform.GetRotation();
	const FVector AxisDir = WeaponRotation.GetForwardVector().GetSafeNormal();
	const FVector AxisY = WeaponRotation.GetRightVector().GetSafeNormal();
	const FVector AxisZ = WeaponRotation.GetUpVector().GetSafeNormal();

	// Everything below reads the pose through the engine rather than rebuilding
	// it. A finger is not a child of the wrist on this skeleton -- there is a
	// metacarpal in between -- and reconstructing those chains by hand is what
	// dislocated the hand: GetComponentSpaceTransform already knows the
	// hierarchy, so it is asked instead of reimplemented.
	auto Chain = [&](int32 Index, int32 Joint) -> const FBoneReference&
	{
		return LeftFingers[Index * FingersPerHand + Joint];
	};

	auto ChainValid = [&](int32 Index) -> bool
	{
		for (int32 Joint = 0; Joint < FingersPerHand; ++Joint)
		{
			if (!Chain(Index, Joint).IsValidToEvaluate())
			{
				return false;
			}
		}
		return true;
	};

	// Read once, in local space, and never again. A component-space read is
	// cached: ask for a knuckle, move the wrist, ask again and the same answer
	// comes back, because the cache does not know its parent moved. Every
	// clearance measured that way describes where the hand used to be, which is
	// why seating it moved nothing. Locals do not have that problem -- they are
	// unaffected by anything the arm solve does -- so the chains are rebuilt
	// from the wrist each time it is asked about.
	TArray<FTransform, TInlineAllocator<8>> PrefixLocals;
	TArray<TArray<FTransform, TInlineAllocator<4>>, TInlineAllocator<8>> JointLocals;
	PrefixLocals.Init(FTransform::Identity, ChainCount);
	JointLocals.SetNum(ChainCount);
	const FCompactPoseBoneIndex HandBone = LeftHand.GetCompactPoseIndex(Container);

	for (int32 Index = 0; Index < ChainCount; ++Index)
	{
		if (!ChainValid(Index))
		{
			continue;
		}

		// A finger is not a child of the wrist on this skeleton -- there is a
		// metacarpal in between -- so the bones between the two are collected
		// and carried, or every chain is rebuilt from the wrong origin.
		TArray<FCompactPoseBoneIndex, TInlineAllocator<4>> Walked;
		FCompactPoseBoneIndex Walk =
			Container.GetParentBoneIndex(Chain(Index, 0).GetCompactPoseIndex(Container));
		while (Walk.IsValid() && Walk != HandBone)
		{
			Walked.Insert(Walk, 0);
			Walk = Container.GetParentBoneIndex(Walk);
		}
		if (Walk != HandBone)
		{
			continue;
		}
		for (const FCompactPoseBoneIndex& Bone : Walked)
		{
			PrefixLocals[Index] = Pose.GetLocalSpaceTransform(Bone) * PrefixLocals[Index];
		}

		for (int32 Joint = 0; Joint < FingersPerHand; ++Joint)
		{
			JointLocals[Index].Add(
				Pose.GetLocalSpaceTransform(Chain(Index, Joint).GetCompactPoseIndex(Container)));
		}
	}

	// Where a chain's joints and fingertip land, given the wrist as it is now
	// and a curl added to every joint. Out[0..n-1] are the joints, Out.Last() is
	// the tip.
	auto ChainPoints = [&](int32 Index, float Degrees, TArray<FVector, TInlineAllocator<8>>& Out)
	{
		Out.Reset();
		if (JointLocals[Index].Num() == 0)
		{
			return;
		}
		const FQuat Curl(CurlAxis, FMath::DegreesToRadians(Degrees));
		FTransform Accum = PrefixLocals[Index] * Pose.GetComponentSpaceTransform(HandBone);
		for (int32 Joint = 0; Joint < FingersPerHand; ++Joint)
		{
			FTransform Local = JointLocals[Index][Joint];
			Local.SetRotation((Local.GetRotation() * Curl).GetNormalized());
			Accum = Local * Accum;
			Out.Add(Accum.GetLocation());
		}
		Out.Add(Accum.TransformPosition(FVector(FingertipLength, 0.0f, 0.0f)));
	};

	if (!ChainValid(0) || !ChainValid(1) || ChainCount < 4 || !ChainValid(3))
	{
		return;
	}

	// Which way this hand's palm faces, measured off its own bones rather than
	// assumed from an axis name. The finger plane is spanned by the middle
	// finger's own direction and the spread from index to pinky; the thumb says
	// which side of that plane the palm is on, because a thumb sits palm-side.
	TArray<FVector, TInlineAllocator<8>> Points;
	ChainPoints(1, 0.0f, Points);
	if (Points.Num() == 0)
	{
		return;
	}
	const FVector MiddleRoot = Points[0];
	const FVector MiddleTip = Points.Last();
	ChainPoints(0, 0.0f, Points);
	const FVector IndexRoot = Points[0];
	ChainPoints(3, 0.0f, Points);
	const FVector PinkyRoot = Points[0];

	const FVector FingerDir = (MiddleTip - MiddleRoot).GetSafeNormal();
	const FVector Spread = (PinkyRoot - IndexRoot).GetSafeNormal();
	FVector Palm = (FingerDir ^ Spread).GetSafeNormal();
	if (FingerDir.IsNearlyZero() || Spread.IsNearlyZero() || Palm.IsNearlyZero())
	{
		return;
	}
	if (ChainCount >= 5 && ChainValid(4))
	{
		ChainPoints(4, 0.0f, Points);
		if (((Points[0] - IndexRoot) | Palm) < 0.0f)
		{
			Palm = -Palm;
		}
	}
	if (GGripPalmFlip > 0)
	{
		Palm = -Palm;
	}

	// Turn the palm to face the fore-end. This is what the fixed roll could not
	// do: rolling the wrist round the weapon moved the hand but left it facing
	// where it faced, so past thirty degrees the fingers pointed away from it.
	const FVector HandOrigin = Pose.GetComponentSpaceTransform(HandBone).GetLocation();
	const FVector Radial = (HandOrigin - (AxisOrigin + AxisDir * ((HandOrigin - AxisOrigin) | AxisDir)))
		.GetSafeNormal();
	if (Radial.IsNearlyZero())
	{
		return;
	}

	FQuat Delta = FQuat::FindBetweenNormals(Palm, -Radial);

	// And then the fingers across the barrel rather than along it: a hand whose
	// palm faces the wood can still be rotated about that palm normal into
	// holding the rifle lengthways, which is not a grip.
	const FVector Turned = (Delta * FingerDir).GetSafeNormal();
	FVector Across = (Turned - AxisDir * (Turned | AxisDir)).GetSafeNormal();
	if (!Turned.IsNearlyZero() && !Across.IsNearlyZero())
	{
		// Angled along the fore-end rather than square across it. A hand does not
		// meet a rifle at a right angle -- the fingers run diagonally forward and
		// the wrist stays neutral -- and demanding square is what puts the twist
		// in: the whole hand has to rotate about its own palm to pay for it.
		const float Lean = FMath::DegreesToRadians(90.0f - GripFingerLeanDegrees);
		Across = (Across * FMath::Cos(Lean) + AxisDir * FMath::Sin(Lean)).GetSafeNormal();
		Delta = FQuat::FindBetweenNormals(Turned, Across) * Delta;
	}

	Delta.Normalize();

	// Capped, because a wrist has a range and the geometry does not know it. The
	// solve asks for whatever turn puts the palm on the wood, and when the clip
	// is holding the rifle at an angle that ask can exceed anything a hand can
	// do -- so it is taken as far as a wrist goes and no further.
	{
		FVector TwistAxis;
		float TwistAngle = 0.0f;
		Delta.ToAxisAndAngle(TwistAxis, TwistAngle);
		TwistAngle = FMath::RadiansToDegrees(TwistAngle);
		if (TwistAngle > 180.0f)
		{
			TwistAngle -= 360.0f;
		}
		if (FMath::Abs(TwistAngle) > MaxGripTwistDegrees)
		{
			Delta = FQuat(TwistAxis,
				FMath::DegreesToRadians(FMath::Sign(TwistAngle) * MaxGripTwistDegrees));
		}
		GripTwistApplied = FMath::Min(FMath::Abs(TwistAngle), MaxGripTwistDegrees);
		GripTwistWanted = FMath::Abs(TwistAngle);
	}

	Delta = FQuat::Slerp(FQuat::Identity, Delta.GetNormalized(),
		FMath::Clamp(LeftHandIKAlpha, 0.0f, 1.0f)).GetNormalized();

	// Applied by the arm solve rather than written onto the bone, because that
	// path already places the whole limb and everything below the wrist follows
	// it. The solve is run again rather than adjusted: it starts from its own
	// answer and reaches the same one, and the turn lands on top of it.
	SolveArm(Pose, LeftUpperArm, LeftLowerArm, LeftHand, TargetComponent, LeftElbowDirection,
		FQuat::Identity, LeftHandIKAlpha, 0.0f, Delta);

	// And then seated, by measurement -- but only in and out along the ray the
	// grip angle defines, never around the section.
	//
	// An earlier version moved the hand by the whole vector that put the
	// knuckles on the wood, which also slid it around the circumference: asked
	// for 291 it left the wrist at 164 and the knuckles at 257, ninety degrees
	// apart, so the hand was wrapped most of the way round the fore-end and read
	// as a wrenched wrist. Wrist and knuckles belong on the same side of a
	// weapon. Distance is the only thing wrong with where the arm solve leaves
	// the hand, so distance is the only thing corrected.
	const float SeatRadius =
		SectionRadius(GripBoreAngleDegrees, ForeEndHalfWidth, ForeEndHalfHeight) + GripKnuckleClearance;

	for (int32 Seat = 0; Seat < 4; ++Seat)
	{
		float Clear = 0.0f;
		int32 Counted = 0;
		for (int32 Index = 0; Index < FMath::Min(4, ChainCount); ++Index)
		{
			ChainPoints(Index, 0.0f, Points);
			if (Points.Num() == 0)
			{
				continue;
			}
			Clear += SectionClearance(Points[0], AxisOrigin, AxisDir, AxisY, AxisZ,
				ForeEndHalfWidth, ForeEndHalfHeight);
			++Counted;
		}
		if (Counted == 0)
		{
			break;
		}

		// How far the knuckles sit off the wood, against how far they should.
		const float Miss = (Clear / Counted - GripKnuckleClearance)
			* FMath::Clamp(LeftHandIKAlpha, 0.0f, 1.0f);
		if (FMath::Abs(Miss) < 0.05f)
		{
			break;
		}

		// Pulled straight in along the grip ray, and never allowed inside the
		// weapon or out past arm's length.
		Reach = FMath::Clamp(Reach - Miss, SeatRadius, SeatRadius + 25.0f);
		TargetComponent = WeaponTransform.TransformPosition(GripOriginLocal + GripDirLocal * Reach);
		SolveArm(Pose, LeftUpperArm, LeftLowerArm, LeftHand, TargetComponent, LeftElbowDirection,
			FQuat::Identity, LeftHandIKAlpha, 0.0f, Delta);
	}

	// The wrist put back the way the animator posed it, relative to the forearm
	// it actually ended up on.
	//
	// The arm solve moves the forearm and leaves the hand pointing where it
	// pointed, so the wrist joint absorbs the whole difference: measured, the
	// bend between forearm and hand goes from 28 degrees in the clip to 53 with
	// the solve on, against 29 on the untouched right hand. That is the kink at
	// the wrist. Holding the hand's world rotation is what causes it -- a hand
	// belongs to its arm, not to the room -- so the local rotation is restored
	// instead and the hand follows wherever the arm went.
	{
		const FCompactPoseBoneIndex HandIndex = LeftHand.GetCompactPoseIndex(Container);
		FTransform HandNow = Pose.GetComponentSpaceTransform(HandIndex);
		const FQuat ForearmNow =
			Pose.GetComponentSpaceTransform(LeftLowerArm.GetCompactPoseIndex(Container)).GetRotation();

		// The clip's wrist relative to the forearm actually reached, and then the
		// palm turned onto the wood on top of it.
		//
		// Order matters and getting it wrong is silent: this restore used to run
		// after the swing and replaced the hand's rotation outright, so the palm
		// orientation was computed, applied, and then discarded every frame.
		// Sweeping the swing cap across 0, 35 and 70 degrees produced three
		// identical frames, which is what a value being thrown away looks like.
		const FQuat Posed = (Delta * ForearmNow * ClipWristLocal).GetNormalized();
		HandNow.SetRotation(FQuat::Slerp(HandNow.GetRotation(), Posed,
			FMath::Clamp(LeftHandIKAlpha, 0.0f, 1.0f)).GetNormalized());
		Pose.SetComponentSpaceTransform(HandIndex, HandNow);

		if (GGripTrace > 0)
		{
			const FQuat Check =
				(Pose.GetLocalSpaceTransform(HandIndex).GetRotation() * ClipWristLocal.Inverse()).GetNormalized();
			float Off = FMath::RadiansToDegrees(Check.GetAngle());
			if (Off > 180.0f)
			{
				Off = 360.0f - Off;
			}
			UE_LOG(LogKBVEFootIK, Display, TEXT("grip: wrist local off clip by %.1f deg after restore"), Off);
		}
	}

	// And the wrist held inside its own range.
	//
	// The clip's wrist is kept above, which is right in principle and not enough
	// on its own: that wrist was posed against the clip's own weapon, and worn
	// at a hand position this weapon dictates it measures 47 degrees between
	// forearm and hand. A wrist carries about thirty. The joint is folded back
	// to that, about the axis it is already bending on, so the hand keeps the
	// direction the pose gave it and loses only the excess.
	if (MaxWristBendDegrees > 0.0f && ChainValid(1))
	{
		const FCompactPoseBoneIndex HandIndex = LeftHand.GetCompactPoseIndex(Container);
		FTransform HandNow = Pose.GetComponentSpaceTransform(HandIndex);
		const FVector ElbowLoc =
			Pose.GetComponentSpaceTransform(LeftLowerArm.GetCompactPoseIndex(Container)).GetLocation();

		ChainPoints(1, 0.0f, Points);
		if (Points.Num() > 0)
		{
			const FVector ForeLine = (HandNow.GetLocation() - ElbowLoc).GetSafeNormal();
			const FVector HandLine = (Points[0] - HandNow.GetLocation()).GetSafeNormal();
			if (!ForeLine.IsNearlyZero() && !HandLine.IsNearlyZero())
			{
				const float Bend = FMath::RadiansToDegrees(
					FMath::Acos(FMath::Clamp(ForeLine | HandLine, -1.0f, 1.0f)));
				const FVector BendAxis = (ForeLine ^ HandLine).GetSafeNormal();
				if (Bend > MaxWristBendDegrees && !BendAxis.IsNearlyZero())
				{
					const float Excess = (Bend - MaxWristBendDegrees)
						* FMath::Clamp(LeftHandIKAlpha, 0.0f, 1.0f);
					const FQuat Straighten(BendAxis, FMath::DegreesToRadians(-Excess));
					HandNow.SetRotation((Straighten * HandNow.GetRotation()).GetNormalized());
					Pose.SetComponentSpaceTransform(HandIndex, HandNow);
				}
			}
		}
	}

	if (GGripTrace > 0)
	{
		// Whether the hand can get there at all, which no amount of seating or
		// curling can change. Upper plus lower arm is the whole reach; a target
		// beyond it leaves the solver straightening the arm and stopping short,
		// and every clearance downstream then describes a hand that was never
		// going to arrive.
		const FVector Shoulder =
			Pose.GetComponentSpaceTransform(LeftUpperArm.GetCompactPoseIndex(Container)).GetLocation();
		const FVector Elbow =
			Pose.GetComponentSpaceTransform(LeftLowerArm.GetCompactPoseIndex(Container)).GetLocation();
		const FVector Wrist = Pose.GetComponentSpaceTransform(HandBone).GetLocation();
		const float ArmLength = (Elbow - Shoulder).Size() + (Wrist - Elbow).Size();
		// Where the hand actually came out around the section, against where it
		// was sent. The solve places a target and the arm reaches for it, but
		// reach limits and the seating step both move the hand afterwards, so
		// asked and achieved are not the same number, and only one of them is
		// what the eye sees.
		const FVector HandLocal = WeaponTransform.InverseTransformPosition(Wrist);
		const float AchievedAngle = FRotator::ClampAxis(FMath::RadiansToDegrees(
			FMath::Atan2(HandLocal.Z - ForeEndCentreHeight, HandLocal.Y)));

		// The knuckles are what the seat step actually places, and what touches
		// the wood; the wrist ends a palm away from them and is not the number
		// to judge the hold by.
		FVector KnuckleMean = FVector::ZeroVector;
		int32 KnuckleCount = 0;
		for (int32 Index = 0; Index < FMath::Min(4, ChainCount); ++Index)
		{
			ChainPoints(Index, 0.0f, Points);
			if (Points.Num() > 0)
			{
				KnuckleMean += Points[0];
				++KnuckleCount;
			}
		}
		float KnuckleAngle = -1.0f;
		if (KnuckleCount > 0)
		{
			const FVector KnuckleLocal =
				WeaponTransform.InverseTransformPosition(KnuckleMean / KnuckleCount);
			KnuckleAngle = FRotator::ClampAxis(FMath::RadiansToDegrees(
				FMath::Atan2(KnuckleLocal.Z - ForeEndCentreHeight, KnuckleLocal.Y)));
		}

		UE_LOG(LogKBVEFootIK, Display,
			TEXT("grip: angle asked %.0f wrist %.0f knuckles %.0f, shoulder->target %.1f cm, arm %.1f cm, wrist ended %.1f cm from target, along %.1f, twist %.1f of %.1f, roll %.1f of %.1f deg wanted"),
			GripBoreAngleDegrees, AchievedAngle, KnuckleAngle,
			(TargetComponent - Shoulder).Size(), ArmLength, (Wrist - TargetComponent).Size(), AlongBarrel,
			GripTwistApplied, GripTwistWanted, GripRollApplied, GripRollWanted);
	}

	// Fingers come from the authored pose when there is one, and the search
	// below is not run at all. It exists for a weapon with no pose yet: closing
	// each finger to contact does put them on the wood, but contact is a much
	// weaker condition than a grip -- it says nothing about wrist angle, how
	// curl distributes across the joints, or what the thumb opposes -- so it
	// yields to a pose whenever one is available.
	if (!bGripSolveFingers || (bGripPoseSampled && GripPoseLocals.Num() == LeftFingers.Num()))
	{
		return;
	}

	// Close each finger until it touches the wood. The measure is the closest
	// approach of the whole finger, not the fingertip alone, so a finger stops
	// on the fore-end instead of curling through it to put its tip on the far
	// side -- which is how a solver produces a fist inside a barrel.
	const float MaxDegrees = FMath::Max(MaxGripCurlDegrees, 0.0f);
	const float Alpha = FMath::Clamp(LeftHandIKAlpha, 0.0f, 1.0f);

	OutCurlDegrees.Init(0.0f, ChainCount);

	// Which way this hand closes, decided once for the whole hand. Solving each
	// finger for its own best direction satisfies the distances and produces a
	// hand with the index curling one way and the pinky the other, which is not
	// a pose a hand can hold. Fingers close together or the answer is nonsense,
	// however good its numbers look.
	float ClosingSign = 1.0f;
	{
		float Best = TNumericLimits<float>::Max();
		for (const float Candidate : { 1.0f, -1.0f })
		{
			float Total = 0.0f;
			int32 Counted = 0;
			for (int32 Index = 0; Index < FMath::Min(4, ChainCount); ++Index)
			{
				if (!ChainValid(Index))
				{
					continue;
				}
				TArray<FVector, TInlineAllocator<8>> Closed;
				ChainPoints(Index, Candidate * MaxDegrees, Closed);
				if (Closed.Num() == 0)
				{
					continue;
				}
				Total += FMath::Abs(SectionClearance(Closed.Last(), AxisOrigin, AxisDir, AxisY, AxisZ,
					ForeEndHalfWidth, ForeEndHalfHeight));
				++Counted;
			}
			if (Counted > 0 && Total / Counted < Best)
			{
				Best = Total / Counted;
				ClosingSign = Candidate;
			}
		}
	}

	for (int32 Index = 0; Index < ChainCount; ++Index)
	{
		if (!ChainValid(Index))
		{
			continue;
		}

		// Closest approach of the whole finger to the fore-end, with a curl of
		// the given size added to every joint. Joint origins from the second one
		// on -- the knuckle is where the wrist solve put it and testing it would
		// report contact before the finger has closed at all -- plus midpoints,
		// because a phalanx is a segment whose ends can straddle the section
		// while its middle is buried in it.
		auto Clearance = [&](float Degrees) -> float
		{
			TArray<FVector, TInlineAllocator<8>> Local;
			ChainPoints(Index, Degrees, Local);
			if (Local.Num() == 0)
			{
				return 0.0f;
			}

			float Closest = TNumericLimits<float>::Max();
			for (int32 Point = 1; Point < Local.Num(); ++Point)
			{
				Closest = FMath::Min(Closest, SectionClearance(Local[Point], AxisOrigin, AxisDir,
					AxisY, AxisZ, ForeEndHalfWidth, ForeEndHalfHeight));
				Closest = FMath::Min(Closest,
					SectionClearance((Local[Point] + Local[Point - 1]) * 0.5f, AxisOrigin, AxisDir,
						AxisY, AxisZ, ForeEndHalfWidth, ForeEndHalfHeight));
			}
			return Closest;
		};

		// The thumb opposes the fingers rather than joining them: it does not
		// share their bend axis, so it travels the other way and less far.
		const float Limit = MaxDegrees * (Index >= 4 ? FMath::Abs(ThumbCurlScale) : 1.0f);
		float Degrees = 0.0f;

		if (!FMath::IsNearlyZero(Limit))
		{
			// Only how far, never which way -- the direction belongs to the hand.
			const float Toward = FMath::Abs(Limit) * ClosingSign * (Index >= 4 ? -1.0f : 1.0f);
			const float Rest = Clearance(0.0f);

			if (Clearance(Toward) * Rest > 0.0f)
			{
				// No contact anywhere in range: close as far as the joint may,
				// which at least shuts the gap rather than leaving it open.
				Degrees = FMath::Abs(Clearance(Toward)) < FMath::Abs(Rest) ? Toward : 0.0f;
			}
			else
			{
				// Clearance changes sign along the way, so contact is a root and
				// a bisection finds it. Twelve halvings of eighty degrees is a
				// fifth of a degree, finer than the mesh can show.
				float Low = 0.0f;
				float High = Toward;
				const bool bLowOutside = Rest > 0.0f;
				for (int32 Step = 0; Step < 12; ++Step)
				{
					const float Mid = (Low + High) * 0.5f;
					((Clearance(Mid) > 0.0f) == bLowOutside ? Low : High) = Mid;
				}
				Degrees = Low;
			}
		}

		OutCurlDegrees[Index] = Degrees * Alpha;

		if (GGripTrace > 0)
		{
			UE_LOG(LogKBVEFootIK, Display,
				TEXT("grip: chain %d closed %+.1f deg, clearance %.2f cm, section %.1fx%.1f at z%.1f, wrist %.1f deg, palm dot %.2f"),
				Index, Degrees, Clearance(Degrees), ForeEndHalfWidth, ForeEndHalfHeight,
				ForeEndCentreHeight, GripBoreAngleDegrees, (Delta * Palm) | -Radial);
		}
	}
}
