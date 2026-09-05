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
	constexpr int32 FingerChainTotal = 15;

	// What a point off the end of the weapon measures. Far enough outside any
	// section that a sweep never mistakes it for an approach, and finite so
	// that averaging or comparing it stays defined.
	constexpr float NoContact = 9.0f;
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

bool FKBVEFootIKProxy::DeriveGripRotation(const FBoneContainer& Container, const FQuat& WeaponRotation,
	const FQuat& ClipHandRotation, FQuat& OutRotation, FVector& OutWristOffset,
	FVector& OutElbowDirection) const
{
	// The support hand's orientation, derived rather than dialled.
	//
	// Every previous attempt made this a number a person found by eye, which is
	// why it never survived a second weapon: an angle tuned against one rifle
	// describes that rifle, not how a hand meets a fore-end. But the hand is an
	// end-effector with a contact constraint, and a contact constraint fixes an
	// orientation outright -- the palm faces the wood, the fingers cross the
	// barrel, and that is a whole frame with nothing left over to tune.
	//
	// Needs the barrel axis and which side the hand comes from. Not the
	// section's size: a thicker fore-end moves the wrist further out, it does
	// not turn it. So this works on a weapon nobody has measured.
	if (GGripDerive == 0 || LeftFingers.Num() < FingerChainTotal)
	{
		return false;
	}

	const FBoneReference& IndexRoot = LeftFingers[0];
	const FBoneReference& MiddleRoot = LeftFingers[3];
	const FBoneReference& PinkyRoot = LeftFingers[9];
	if (!IndexRoot.IsValidToEvaluate() || !MiddleRoot.IsValidToEvaluate() || !PinkyRoot.IsValidToEvaluate())
	{
		return false;
	}

	// The finger roots hang directly off the wrist, so their reference-pose
	// translations are already hand-space vectors and no parent chain has to be
	// walked to read the hand's own axes off the skeleton.
	const FVector RestMiddle =
		Container.GetRefPoseTransform(MiddleRoot.GetCompactPoseIndex(Container)).GetLocation();
	const FVector RestFinger = RestMiddle.GetSafeNormal();
	if (RestFinger.IsNearlyZero())
	{
		return false;
	}

	// Which side of the hand the palm is on, asked rather than assumed.
	//
	// Taking it as a cross product of the spread and finger axes is a guess at
	// handedness, and on a left hand the guess came out pointing through the
	// back of the hand -- which turns the wrist a half turn and reads exactly
	// like an arm bent away from the weapon. The skeleton can be asked instead:
	// closing a finger moves its tip toward the palm, by definition, and which
	// way "closing" is has already been established as a positive turn about
	// FingerCurlAxis. So bend the middle finger and watch where the tip goes.
	const FTransform MiddleRest =
		Container.GetRefPoseTransform(MiddleRoot.GetCompactPoseIndex(Container));
	const FTransform MiddleNext =
		Container.GetRefPoseTransform(LeftFingers[4].GetCompactPoseIndex(Container));
	const FVector Reach = MiddleNext.GetLocation();
	const FQuat Closed = FQuat(FingerCurlAxis.GetSafeNormal(), FMath::DegreesToRadians(15.0f));
	const FVector Before = MiddleRest.TransformVector(Reach);
	const FVector After = MiddleRest.TransformVector(Closed.RotateVector(Reach));

	FVector RestPalm = (After - Before);
	RestPalm -= RestFinger * (RestPalm | RestFinger);
	RestPalm = RestPalm.GetSafeNormal();
	if (RestPalm.IsNearlyZero() || !LeftFingers[4].IsValidToEvaluate())
	{
		return false;
	}

	// Re-derived rather than reused: index and pinky are not exactly abreast on
	// a real hand, so the measured spread is a few degrees off perpendicular and
	// a basis built straight from it is not orthonormal.
	const FMatrix Rest(RestFinger, RestPalm, RestFinger ^ RestPalm, FVector::ZeroVector);

	// Which way round the section the palm arrives from. 270 is from below,
	// which is the side a support hand meets a rifle.
	const float Theta = FMath::DegreesToRadians(GripBoreAngleDegrees);
	const FVector Approach =
		WeaponRotation.RotateVector(FVector(0.0f, FMath::Cos(Theta), FMath::Sin(Theta))).GetSafeNormal();
	const FVector Barrel = WeaponRotation.GetAxisX();
	const FVector Across = (Barrel ^ Approach).GetSafeNormal();
	if (Approach.IsNearlyZero() || Across.IsNearlyZero())
	{
		return false;
	}

	// Fingers can cross the barrel either way and both are valid contacts -- the
	// geometry cannot separate them, because a hand rotated 180 degrees about
	// the palm normal still touches the same wood. The clip breaks the tie: an
	// animator already chose which way this arm approaches the weapon, and that
	// choice is the one thing here worth keeping from it.
	const FVector Palm = -Approach;
	float Best = -2.0f;
	for (int32 Side = 0; Side < 2; ++Side)
	{
		const FVector Finger = Side == 0 ? Across : -Across;
		const FMatrix Want(Finger, Palm, Finger ^ Palm, FVector::ZeroVector);
		const FQuat Candidate = FQuat(Rest.GetTransposed() * Want).GetNormalized();
		const float Agreement = FMath::Abs(Candidate | ClipHandRotation);
		if (Agreement > Best)
		{
			Best = Agreement;
			OutRotation = Candidate;
		}
	}

	// Where the wrist has to be for the palm to land on the wood.
	//
	// The socket was placing hand_l itself against the fore-end, and a wrist is
	// not what touches a rifle: the wood sits in the palm, a hand's length
	// further on. Pinning the wrist to the surface put every fingertip about
	// three section-radii clear of it, closing on air -- which is what the wrap
	// measured and could not fix, because no amount of curl reaches wood the
	// hand is standing off from.
	//
	// Both distances come off the skeleton. How far the knuckles are from the
	// wrist is the middle finger's own root offset; how thick the hand is
	// across the palm is that offset's own spread, which is the closest thing
	// the rig states to a palm depth.
	const FVector FingerWorld = OutRotation.RotateVector(RestFinger);
	const FVector PalmWorld = OutRotation.RotateVector(RestPalm);
	const float Knuckle = RestMiddle.Size();

	// How deep the palm is, off the rig rather than out of a constant.
	//
	// The thumb is the only depth the rig states: its root hangs off the palm
	// side of the wrist, and how far it hangs is how thick the hand is there.
	// Half the knuckle spread stood in for this once and was nonsense twice
	// over -- it came out under the floor it was clamped to, so every trace
	// printed the clamp, and it was measuring a spread that is not in the
	// offsets at all. Manny's four finger roots are within half a centimetre of
	// each other; the hand fans out by rotation, not by position.
	const FBoneReference& ThumbRoot = LeftFingers[12];
	const double ThumbDepth = ThumbRoot.IsValidToEvaluate()
		? FMath::Abs(Container.GetRefPoseTransform(ThumbRoot.GetCompactPoseIndex(Container))
			.GetLocation() | RestPalm)
		: 0.0;
	const float Thickness = static_cast<float>(FMath::Max(ThumbDepth, 1.5));

	// The section's own radius in the direction the palm arrives from, so a
	// deeper fore-end stands the hand further off without anybody restating it.
	const float Radius = FVector2D(FMath::Cos(Theta) * ForeEndHalfWidth,
		FMath::Sin(Theta) * ForeEndHalfHeight).Size();

	OutWristOffset = -PalmWorld * (Radius + Thickness) - FingerWorld * Knuckle;

	// Which way the elbow hangs, taken from the weapon instead of pinned to the
	// character.
	//
	// It was a constant in component space, which is a direction that means one
	// thing while a rifle is level and something else the moment it is not: the
	// arm kept its elbow pointing at the floor while the weapon pitched, and a
	// support arm that does not follow what it is supporting reads as bent away
	// from it. The palm already says which side of the weapon the hand is on,
	// and an elbow belongs on the far side of the hand from the wood. Weight
	// stays on down, because gravity is the other half of where an elbow goes.
	OutElbowDirection = (-PalmWorld * 0.8f + FVector::DownVector).GetSafeNormal();
	if (OutElbowDirection.IsNearlyZero())
	{
		OutElbowDirection = FVector::DownVector;
	}

	if (GGripTrace > 0)
	{
		UE_LOG(LogKBVEFootIK, Display,
			TEXT("grip: derived hand frame at %.0f deg, palm (%.2f %.2f %.2f), knuckle %.2f thick %.2f radius %.2f, elbow (%.2f %.2f %.2f), agreement %.3f"),
			GripBoreAngleDegrees, RestPalm.X, RestPalm.Y, RestPalm.Z,
			Knuckle, Thickness, Radius,
			OutElbowDirection.X, OutElbowDirection.Y, OutElbowDirection.Z, Best);
	}
	return true;
}

void FKBVEFootIKProxy::WrapFingers(FCompactPose& Pose, const FBoneContainer& Container,
	const FTransform& HandComponent, const FTransform& WeaponToComponent) const
{
	// Close each finger onto the fore-end until its pad touches it.
	//
	// One number per finger -- how far that finger is closed -- found by
	// bisection against the section the weapon carries. What sank this before
	// was solving it together with the wrist: contact is satisfied by a great
	// many hands, so a search free to move the wrist as well wanders off into
	// poses that touch the wood and look like nothing a person does. With the
	// wrist already placed there is exactly one unknown left per finger and it
	// is monotonic in the curl, which is what makes bisection legitimate here
	// and illegitimate before.
	if (GGripWrap == 0 || FingersPerHand <= 0 || LeftFingers.Num() < FingerChainTotal)
	{
		return;
	}
	if (ForeEndHalfWidth <= KINDA_SMALL_NUMBER || ForeEndHalfHeight <= KINDA_SMALL_NUMBER)
	{
		return;
	}

	const FVector Axis = FingerCurlAxis.GetSafeNormal();
	if (Axis.IsNearlyZero())
	{
		return;
	}

	// How far outside the section a fingertip sits, as a multiple of the
	// section's own radius in that direction. One means touching. Measured on
	// an ellipse rather than a circle because a fore-end is a block of wood,
	// deeper than it is wide, and a circle through it either floats the fingers
	// off the sides or buries them in the top.
	//
	// The section is looked up at the finger's own station along the weapon
	// rather than stated once. Stated once it had no X in it at all, and a
	// measurement with no X says a finger pointing straight down the barrel is
	// exactly as close to the wood as one resting on it -- so asking the solver
	// to unbury a buried finger straightened the whole hand instead, which is
	// the failure that put this behind a switch. Past the end of the weapon
	// there is no answer, and saying so is what stops the search wandering
	// there.
	auto Outside = [this, &WeaponToComponent](const FVector& Point) -> float
	{
		const FVector Local = WeaponToComponent.InverseTransformPosition(Point);

		float HalfWidth = ForeEndHalfWidth;
		float HalfHeight = ForeEndHalfHeight;
		float CentreY = 0.0f;
		float CentreZ = ForeEndCentreHeight;

		if (ForeEndProfile.Num() > 0 && ProfileSlabWidth > KINDA_SMALL_NUMBER)
		{
			// Indexed, not searched. The profile is dense along the weapon --
			// slices with no geometry are present and carry no width -- so the
			// station is arithmetic, which matters at five fingers times a
			// sixty-four step sweep times three points on each.
			const int32 Index = FMath::RoundToInt((Local.X - ForeEndProfile[0].X) / ProfileSlabWidth);
			if (!ForeEndProfile.IsValidIndex(Index))
			{
				return NoContact;
			}
			const FKBVEGripSlab& Slab = ForeEndProfile[Index];
			if (Slab.HalfWidth <= KINDA_SMALL_NUMBER || Slab.HalfHeight <= KINDA_SMALL_NUMBER)
			{
				return NoContact;
			}
			HalfWidth = Slab.HalfWidth;
			HalfHeight = Slab.HalfHeight;
			CentreY = Slab.CentreY;
			CentreZ = Slab.CentreZ;
		}

		const float Y = (Local.Y - CentreY) / HalfWidth;
		const float Z = (Local.Z - CentreZ) / HalfHeight;
		return FMath::Sqrt(Y * Y + Z * Z);
	};

	for (int32 Chain = 0; Chain < FingerChainTotal / 3; ++Chain)
	{
		const FBoneReference& J0 = LeftFingers[Chain * 3 + 0];
		const FBoneReference& J1 = LeftFingers[Chain * 3 + 1];
		const FBoneReference& J2 = LeftFingers[Chain * 3 + 2];
		if (!J0.IsValidToEvaluate() || !J1.IsValidToEvaluate() || !J2.IsValidToEvaluate())
		{
			continue;
		}

		const FCompactPoseBoneIndex B0 = J0.GetCompactPoseIndex(Container);
		const FCompactPoseBoneIndex B1 = J1.GetCompactPoseIndex(Container);
		const FCompactPoseBoneIndex B2 = J2.GetCompactPoseIndex(Container);
		const FTransform L0 = Pose[B0];
		const FTransform L1 = Pose[B1];
		const FTransform L2 = Pose[B2];

		// The knuckle carries the most, the tip the least -- a finger closing
		// on a cylinder is not three equal bends, and equal bends are what make
		// a hand read as a cartoon claw.
		const float Share[3] = { 1.0f, 0.85f, 0.6f };

		// Every joint, not just the tip.
		//
		// A fingertip clear of the wood says nothing about the knuckle behind
		// it: a finger closed too far buries its middle phalanx while the tip
		// comes out the far side reading perfectly. Testing one point is how a
		// hand ends up through a rifle it is supposedly holding, so the whole
		// chain is measured and the deepest part of it is what counts.
		auto Closest = [&](float Degrees) -> float
		{
			FTransform C0 = L0;
			FTransform C1 = L1;
			FTransform C2 = L2;
			C0.SetRotation((C0.GetRotation()
				* FQuat(Axis, FMath::DegreesToRadians(Degrees * Share[0]))).GetNormalized());
			C1.SetRotation((C1.GetRotation()
				* FQuat(Axis, FMath::DegreesToRadians(Degrees * Share[1]))).GetNormalized());
			C2.SetRotation((C2.GetRotation()
				* FQuat(Axis, FMath::DegreesToRadians(Degrees * Share[2]))).GetNormalized());
			const FTransform T0 = C0 * HandComponent;
			const FTransform T1 = C1 * T0;
			const FTransform T2 = C2 * T1;
			return FMath::Min3(
				Outside(T1.GetLocation()),
				Outside(T2.GetLocation()),
				Outside(T2.TransformPosition(FVector(FingertipLength, 0.0f, 0.0f))));
		};

		// Contact is the pad touching, not the joint centre reaching the
		// surface, so the target sits a knuckle's clearance proud of it.
		const float Target =
			1.0f + GripKnuckleClearance / FMath::Max(ForeEndHalfWidth, KINDA_SMALL_NUMBER);

		// Both ways, because a finger can be wrong in both directions.
		//
		// Closing was the only correction here, on the assumption that a hand
		// authored for a fatter weapon is always too open for a thinner one.
		// Once the wrist was set back so the palm meets the wood, the opposite
		// became true and fingers arrived already through it -- whereupon a
		// solver that only closes looked at a buried finger, called it contact
		// and left it buried.
		const float Open = Closest(0.0f);
		const float Slack = Open - Target;
		if (FMath::Abs(Slack) < 0.02f)
		{
			continue;
		}

		// Swept rather than bisected. A fingertip travels an arc, so its
		// distance to the wood falls, crosses, and climbs again out the far
		// side; bisection assumes a single crossing and picks nonsense off the
		// second. Sweeping outward from the current pose also finds which way a
		// thumb closes -- it opposes the fingers, and that is discovered rather
		// than hardcoded.
		constexpr int32 Samples = 64;
		float Best = 0.0f;
		float BestError = FMath::Abs(Slack);
		bool bCrossed = false;
		float Previous = 0.0f;

		for (int32 Index = 1; Index <= Samples && !bCrossed; ++Index)
		{
			const float Magnitude = MaxGripCurlDegrees * float(Index) / float(Samples);
			for (int32 Side = 0; Side < 2; ++Side)
			{
				const float Degrees = Side == 0 ? Magnitude : -Magnitude;
				const float Here = Closest(Degrees) - Target;
				if (Here * Slack <= 0.0f)
				{
					// Bracketed between the last sample this side and this one.
					float Lo = Previous;
					float Hi = Degrees;
					for (int32 Step = 0; Step < 10; ++Step)
					{
						const float Mid = 0.5f * (Lo + Hi);
						if ((Closest(Mid) - Target) * Slack > 0.0f)
						{
							Lo = Mid;
						}
						else
						{
							Hi = Mid;
						}
					}
					Best = Hi;
					BestError = FMath::Abs(Closest(Hi) - Target);
					bCrossed = true;
					break;
				}
				if (FMath::Abs(Here) < BestError)
				{
					Best = Degrees;
					BestError = FMath::Abs(Here);
				}
				Previous = Degrees;
			}
		}

		// Nothing crossed: keep the closest approach rather than leaving the
		// finger where it was. A hand that cannot quite meet a thin fore-end
		// still reads as a hand holding something; a flat one does not.
		const float Lo = Best;

		for (int32 Joint = 0; Joint < 3; ++Joint)
		{
			const FCompactPoseBoneIndex Bone = Joint == 0 ? B0 : (Joint == 1 ? B1 : B2);
			Pose[Bone].SetRotation((Pose[Bone].GetRotation()
				* FQuat(Axis, FMath::DegreesToRadians(Lo * Share[Joint]))).GetNormalized());
		}

		// What each finger had to travel, and where it ended up. Whether a hand
		// is wrapped is not a thing a still frame answers honestly -- a finger
		// beside the wood and a finger round it read alike from most angles --
		// but "closed 34 degrees, pad at 1.02 of the section" does.
		if (GGripTrace > 0)
		{
			UE_LOG(LogKBVEFootIK, Display,
				TEXT("grip wrap: chain %d open %.2f turned %+.1f deg -> %.2f (target %.2f)%s"),
				Chain, Open, Lo, Closest(Lo), Target,
				Open < Target ? TEXT(" [was through the wood]") : TEXT(""));
		}
	}
}

float FKBVEFootIKProxy::ChooseGripAlong(const FBoneContainer& Container,
	const FTransform& WeaponToComponent, const FVector& Shoulder, float DefaultAlong) const
{
	// Where along the fore-end the hand takes hold, chosen by the arm.
	//
	// A person's support hand goes as far forward as it comfortably reaches and
	// no further, which is why a single authored number is wrong twice over: at
	// the rear of the wood the hold is cramped and the elbow folds, at the front
	// the arm locks straight and the fingers close on air. The wood's extent is
	// a property of the weapon, how far up it the hand lands is a property of
	// the arm, and only the first belongs in a config.
	//
	// This existed before and was switched off because it scored a point that a
	// later seating step then moved, so it chose the front of the wood and left
	// the arm short of its own target. That step is gone; the scoring is now
	// against the point the arm is actually sent to.
	if (GripArmExtension <= KINDA_SMALL_NUMBER || GripAlongMax <= GripAlongMin)
	{
		return DefaultAlong;
	}
	if (!LeftLowerArm.IsValidToEvaluate() || !LeftHand.IsValidToEvaluate())
	{
		return DefaultAlong;
	}

	// Bone lengths off the reference pose rather than the animated one: an arm's
	// reach is a fact about the skeleton, and measuring it mid-clip would make
	// the grip point wander with whatever the character is doing.
	const float UpperLength =
		Container.GetRefPoseTransform(LeftLowerArm.GetCompactPoseIndex(Container)).GetLocation().Size();
	const float LowerLength =
		Container.GetRefPoseTransform(LeftHand.GetCompactPoseIndex(Container)).GetLocation().Size();
	const float Reach = (UpperLength + LowerLength) * GripArmExtension;
	if (Reach <= KINDA_SMALL_NUMBER)
	{
		return DefaultAlong;
	}

	const float SocketY = SupportHandSocket.GetLocation().Y;
	const float SocketZ = SupportHandSocket.GetLocation().Z;
	auto DistanceAt = [&](float Along) -> float
	{
		return FVector::Dist(Shoulder,
			WeaponToComponent.TransformPosition(FVector(Along, SocketY, SocketZ)));
	};

	// Monotonic along the wood -- the muzzle end is further from the shoulder
	// than the breech end -- so the ends bracket the answer and bisection finds
	// it. Clamped rather than extrapolated: a hand does not hold a rifle by a
	// point beyond its woodwork because the arm would have preferred one.
	const float AtMin = DistanceAt(GripAlongMin);
	const float AtMax = DistanceAt(GripAlongMax);
	if (AtMin >= Reach)
	{
		return GripAlongMin;
	}
	if (AtMax <= Reach)
	{
		return GripAlongMax;
	}

	float Lo = GripAlongMin;
	float Hi = GripAlongMax;
	for (int32 Step = 0; Step < 14; ++Step)
	{
		const float Mid = 0.5f * (Lo + Hi);
		if (DistanceAt(Mid) < Reach)
		{
			Lo = Mid;
		}
		else
		{
			Hi = Mid;
		}
	}
	return 0.5f * (Lo + Hi);
}
