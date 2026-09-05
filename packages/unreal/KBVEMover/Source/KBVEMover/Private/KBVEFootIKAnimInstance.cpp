#include "KBVEFootIKAnimInstance.h"

#include "KBVEGripInternal.h"
#include "KBVEWeaponGrip.h"

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

DEFINE_LOG_CATEGORY(LogKBVEFootIK);

// The mannequin's finger chains, in the order every per-finger array here is
// built and read. One list, because an authored grip is written per chain and
// applied per joint and the two orders have to agree.
namespace
{
	static const TCHAR* GFingerChains[] =
		{ TEXT("index"), TEXT("middle"), TEXT("ring"), TEXT("pinky"), TEXT("thumb") };
	constexpr int32 FingerChainCount = UE_ARRAY_COUNT(GFingerChains);
	constexpr int32 JointsPerFinger = 3;
}

namespace KBVEGrip
{
	// Tuning handles for the support-hand grip. Negative curl means "leave the
	// property alone"; the axis index selects which bone-local axis a joint
	// bends about, which is faster to find by trying three than by deriving it.
	float GGripCurl = -1000.0f;
	float GGripThumb = -1000.0f;
	int32 GGripAxis = -1;
	float GGripRoll = -1000.0f;
	static FAutoConsoleVariableRef CVarGripRoll(
		TEXT("kbve.Grip.Roll"), GGripRoll,
		TEXT("Roll the support hand around the barrel, degrees."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripCurl(
		TEXT("kbve.Grip.Curl"), GGripCurl, TEXT("Support-hand curl, degrees per joint."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripThumb(
		TEXT("kbve.Grip.Thumb"), GGripThumb, TEXT("Support-hand thumb curl, degrees."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripAxis(
		TEXT("kbve.Grip.Axis"), GGripAxis, TEXT("0=X 1=Y 2=Z, +3 to negate. -1 uses the property."), ECVF_Default);

	// The contact solve's two inputs, live: where the wrist sits around the bore
	// and how thick the thing it is holding is.
	float GGripBoreAngle = -1000.0f;
	float GGripWidth = -1000.0f;
	float GGripHeight = -1000.0f;
	float GGripCentre = -1000.0f;
	float GGripAlong = -1000.0f;
	float GGripLean = -1000.0f;
	float GGripTwist = -1000.0f;
	float GGripRoll2 = -1000.0f;
	int32 GGripPalmFlip = 0;
	int32 GGripFingers = -1;
	float GGripBend = -1000.0f;
	float GWristTwistShare = -1000.0f;
	int32 GGripContact = -1;
	static FAutoConsoleVariableRef CVarGripBoreAngle(
		TEXT("kbve.Grip.BoreAngle"), GGripBoreAngle,
		TEXT("Support wrist angle around the bore, degrees. 270 is straight under."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripWidth(
		TEXT("kbve.Grip.Width"), GGripWidth,
		TEXT("Fore-end half-width the fingers close onto, cm."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripHeight(
		TEXT("kbve.Grip.Height"), GGripHeight,
		TEXT("Fore-end half-height the fingers close onto, cm."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripLean(
		TEXT("kbve.Grip.Lean"), GGripLean,
		TEXT("How the fingers cross the fore-end, degrees. 90 is square across."), ECVF_Default);
	int32 GFitWeapon = -1;
	// The socket, dialable. Placing a grip is an eye job, and an eye job wants
	// a knob rather than a rebuild between each look.
	float GSocketPitch = -1000.0f;
	float GSocketYaw = -1000.0f;
	float GSocketRoll = -1000.0f;
	static FAutoConsoleVariableRef CVarSocketPitch(
		TEXT("kbve.Grip.SocketPitch"), GSocketPitch,
		TEXT("Support-hand socket pitch, degrees. Any of these enables socket rotation."), ECVF_Default);
	static FAutoConsoleVariableRef CVarSocketYaw(
		TEXT("kbve.Grip.SocketYaw"), GSocketYaw, TEXT("Support-hand socket yaw, degrees."), ECVF_Default);
	static FAutoConsoleVariableRef CVarSocketRoll(
		TEXT("kbve.Grip.SocketRoll"), GSocketRoll, TEXT("Support-hand socket roll, degrees."), ECVF_Default);

	float GSocketX = -1000.0f;
	float GSocketY = -1000.0f;
	float GSocketZ = -1000.0f;
	static FAutoConsoleVariableRef CVarSocketX(
		TEXT("kbve.Grip.SocketX"), GSocketX,
		TEXT("Support-hand socket along the weapon, cm. Weapon space."), ECVF_Default);
	static FAutoConsoleVariableRef CVarSocketY(
		TEXT("kbve.Grip.SocketY"), GSocketY,
		TEXT("Support-hand socket across the weapon, cm. Weapon space."), ECVF_Default);
	static FAutoConsoleVariableRef CVarSocketZ(
		TEXT("kbve.Grip.SocketZ"), GSocketZ,
		TEXT("Support-hand socket above the weapon, cm. Weapon space."), ECVF_Default);

	float GGripTrimX = -1000.0f;
	float GGripTrimY = -1000.0f;
	float GGripTrimZ = -1000.0f;
	static FAutoConsoleVariableRef CVarGripTrimX(
		TEXT("kbve.Grip.TrimX"), GGripTrimX, TEXT("Support hand nudge forward, cm."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripTrimY(
		TEXT("kbve.Grip.TrimY"), GGripTrimY, TEXT("Support hand nudge sideways, cm."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripTrimZ(
		TEXT("kbve.Grip.TrimZ"), GGripTrimZ, TEXT("Support hand nudge up, cm. Negative lowers the wrist."), ECVF_Default);
	static FAutoConsoleVariableRef CVarFitWeapon(
		TEXT("kbve.Weapon.FitToHands"), GFitWeapon,
		TEXT("1 aims the weapon at the support hand, 0 solves the hand onto the weapon. -1 uses the property."),
		ECVF_Default);
	static FAutoConsoleVariableRef CVarWristTwistShare(
		TEXT("kbve.Grip.TwistShare"), GWristTwistShare,
		TEXT("Fraction of the roll the solve adds at a wrist that the forearm twist bones carry. 0 restores the pinch."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripBend(
		TEXT("kbve.Grip.Bend"), GGripBend,
		TEXT("Most the wrist may bend between forearm and hand, degrees. 0 disables."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripFingers(
		TEXT("kbve.Grip.Fingers"), GGripFingers,
		TEXT("1 closes the fingers to contact, 0 keeps the clip's. -1 uses the property."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripPalmFlip(
		TEXT("kbve.Grip.PalmFlip"), GGripPalmFlip,
		TEXT("Flip the measured palm normal, to test its sign."), ECVF_Default);
	static FAutoConsoleVariableRef CVarWristRoll(
		TEXT("kbve.Grip.WristRoll"), GGripRoll2,
		TEXT("Most the hand may roll about its own forearm, degrees."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripTwist(
		TEXT("kbve.Grip.Twist"), GGripTwist,
		TEXT("Most the solve may turn the wrist from the clip, degrees."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripAlong(
		TEXT("kbve.Grip.Along"), GGripAlong,
		TEXT("Where along the barrel the support hand grips, weapon-space cm."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripCentre(
		TEXT("kbve.Grip.Centre"), GGripCentre,
		TEXT("Height of the fore-end centre above the weapon X axis, cm."), ECVF_Default);
	static FAutoConsoleVariableRef CVarGripContact(
		TEXT("kbve.Grip.Contact"), GGripContact,
		TEXT("1 solves the grip to contact, 0 uses the tuned constants. -1 uses the property."), ECVF_Default);

	// What the grip solve decided, as numbers. A grip either closes on the wood
	// or it does not, and that is a distance rather than an impression.
	int32 GGripDerive = 1;
	static FAutoConsoleVariableRef CVarGripDerive(
		TEXT("kbve.Grip.Derive"), GGripDerive,
		TEXT("Work the support hand's orientation out from the weapon. 0 keeps the clip's wrist."),
		ECVF_Default);

	// Off. It measures distance from the section's axis and nothing else, and a
	// finger pointing straight away satisfies that exactly as well as a finger
	// resting on the wood -- so asking it to fix fingers that started inside the
	// fore-end straightened the hand instead of unwrapping it by the few degrees
	// wanted. This is the failure the previous solver recorded before it was
	// deleted, reached by a shorter route: contact distance is satisfied by
	// poses no hand can hold. A test that separates wrapped from merely near
	// needs the weapon's own geometry, not an ellipse.
	int32 GGripWrap = 0;
	static FAutoConsoleVariableRef CVarGripWrap(
		TEXT("kbve.Grip.Wrap"), GGripWrap,
		TEXT("Close the support fingers onto the fore-end until they contact it."), ECVF_Default);

	int32 GGripTrace = 0;
	static FAutoConsoleVariableRef CVarGripTrace(
		TEXT("kbve.Grip.Trace"), GGripTrace,
		TEXT("Log the solved wrist angle, per-finger close and fingertip clearance."), ECVF_Default);
}
using namespace KBVEGrip;


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
	for (FBoneReference* Bone : {&LeftFoot, &LeftCalf, &LeftThigh, &RightFoot, &RightCalf, &RightThigh, &Pelvis, &Spine,
			&Chest, &LeftUpperArm, &LeftLowerArm, &LeftHand, &RightUpperArm, &RightLowerArm, &RightHand, &WeaponHand,
			&LeftForearmTwist, &LeftForearmTwist2, &RightForearmTwist, &RightForearmTwist2})
	{
		Bone->Initialize(Bones);
	}

	for (FBoneReference& Finger : LeftFingers)
	{
		Finger.Initialize(Bones);
	}
	for (FBoneReference& Finger : RightFingers)
	{
		Finger.Initialize(Bones);
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

void FKBVEFootIKProxy::SolveArm(FCSPose<FCompactPose>& Pose, const FBoneReference& UpperArm,
	const FBoneReference& LowerArm, const FBoneReference& Hand, const FVector& Target,
	const FVector& ElbowDirection, const FQuat& HandRotation, float Alpha, float RotationAlpha,
	const FQuat& RotationDelta) const
{
	if (!UpperArm.IsValidToEvaluate() || !LowerArm.IsValidToEvaluate() || !Hand.IsValidToEvaluate())
	{
		return;
	}
	if (Alpha <= KINDA_SMALL_NUMBER)
	{
		return;
	}

	const FBoneContainer& Container = Pose.GetPose().GetBoneContainer();
	FTransform UpperTransform = Pose.GetComponentSpaceTransform(UpperArm.GetCompactPoseIndex(Container));
	FTransform LowerTransform = Pose.GetComponentSpaceTransform(LowerArm.GetCompactPoseIndex(Container));
	FTransform HandTransform = Pose.GetComponentSpaceTransform(Hand.GetCompactPoseIndex(Container));

	// Blended toward the weapon rather than snapped onto it, so raising and
	// lowering the rifle is a movement instead of a substitution.
	const FVector Effector = FMath::Lerp(HandTransform.GetLocation(), Target, Alpha);

	// The solver wants a position, and only the plane it makes with the shoulder
	// and the hand matters, so the direction is thrown out from the shoulder far
	// enough to be unambiguous. Taken from the shoulder rather than the weapon
	// because an elbow belongs to a body, not to what the body is carrying.
	const FVector JointTarget = UpperTransform.GetLocation() + ElbowDirection.GetSafeNormal() * 100.0f;

	AnimationCore::SolveTwoBoneIK(UpperTransform, LowerTransform, HandTransform, JointTarget, Effector,
		false, 1.0f, 1.0f);

	// Set after the solve, because the solve orients the hand along the limb and
	// what matters is that the palm meets the stock. Skipped entirely when the
	// clip already orients the hand and only its position is being corrected --
	// overwriting a good rotation to fix a position throws away the better half.
	if (RotationAlpha > KINDA_SMALL_NUMBER)
	{
		HandTransform.SetRotation(
			FQuat::Slerp(HandTransform.GetRotation(), HandRotation, RotationAlpha).GetNormalized());
	}

	// A turn applied on top of whatever orientation the hand ended up with,
	// rather than a replacement for it. The clip's wrist angle is kept; it is
	// only rolled around the weapon.
	if (!RotationDelta.IsIdentity())
	{
		HandTransform.SetRotation((RotationDelta * HandTransform.GetRotation()).GetNormalized());
	}

	Pose.SetComponentSpaceTransform(UpperArm.GetCompactPoseIndex(Container), UpperTransform);
	Pose.SetComponentSpaceTransform(LowerArm.GetCompactPoseIndex(Container), LowerTransform);
	Pose.SetComponentSpaceTransform(Hand.GetCompactPoseIndex(Container), HandTransform);
}

void FKBVEFootIKProxy::PoseFingers(FCompactPose& Pose, const TArray<FBoneReference>& Fingers, float Alpha) const
{
	if (Alpha <= KINDA_SMALL_NUMBER || FingersPerHand <= 0)
	{
		return;
	}

	// Local space, and the bend is about the bone's own Z. Every finger joint on
	// this skeleton runs down its own X with Z across the knuckle, so one axis
	// closes all of them and the thumb only differs by how far.
	for (int32 Index = 0; Index < Fingers.Num(); ++Index)
	{
		const FBoneReference& Finger = Fingers[Index];
		if (!Finger.IsValidToEvaluate())
		{
			continue;
		}

		// The first four chains are fingers; the last is the thumb, which
		// opposes rather than curls and closes far less.
		const bool bThumb = (Index / FingersPerHand) >= 4;
		const float Degrees = (bThumb ? ThumbCurlDegrees : FingerCurlDegrees) * Alpha;
		const FQuat Curl(FVector::UpVector, FMath::DegreesToRadians(-Degrees));

		const FCompactPoseBoneIndex BoneIndex = Finger.GetCompactPoseIndex(Pose.GetBoneContainer());
		Pose[BoneIndex].SetRotation((Pose[BoneIndex].GetRotation() * Curl).GetNormalized());
	}
}

void FKBVEFootIKProxy::CurlFingers(FCompactPose& Pose, const TArray<FBoneReference>& Fingers,
	float FingerDegrees, float ThumbDegrees) const
{
	if (FingersPerHand <= 0 || (FMath::IsNearlyZero(FingerDegrees) && FMath::IsNearlyZero(ThumbDegrees)))
	{
		return;
	}

	const FVector Axis = FingerCurlAxis.GetSafeNormal();
	if (Axis.IsNearlyZero())
	{
		return;
	}

	for (int32 Index = 0; Index < Fingers.Num(); ++Index)
	{
		const FBoneReference& Finger = Fingers[Index];
		if (!Finger.IsValidToEvaluate())
		{
			continue;
		}

		// Chains are ordered index, middle, ring, pinky, thumb, so the last one
		// is the thumb -- which opposes rather than curls and takes its own
		// amount.
		const bool bThumb = (Index / FingersPerHand) >= 4;
		const float Degrees = bThumb ? ThumbDegrees : FingerDegrees;
		if (FMath::IsNearlyZero(Degrees))
		{
			continue;
		}

		const FQuat Curl(Axis, FMath::DegreesToRadians(Degrees));
		const FCompactPoseBoneIndex BoneIndex = Finger.GetCompactPoseIndex(Pose.GetBoneContainer());
		Pose[BoneIndex].SetRotation((Pose[BoneIndex].GetRotation() * Curl).GetNormalized());
	}
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

	// Filled by the grip solve and applied after the pose is back in local
	// space. The solve decides the angles; a local rotation applies them, which
	// is the one thing that cannot dislocate a finger.
	TArray<float> GripCurl;

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

	// The forearm as the clip had it, before any arm solve. A wrist can be posed
	// perfectly and the join still look wrenched if the arm below it has been
	// rolled about its own length to reach the weapon: the skin twists between
	// the two, and the joint angle never reports it.
	const FQuat ClipForearm = LeftLowerArm.IsValidToEvaluate()
		? Pose.GetComponentSpaceTransform(LeftLowerArm.GetCompactPoseIndex(Container)).GetRotation()
		: FQuat::Identity;

	// Each arm bone's local rotation as the clip had it. Left against right is
	// not a control -- the skeleton is mirrored, so the same pose reads as
	// different numbers on the two sides -- but a bone against its own clip
	// value is, and it says exactly how much roll the solve added.
	auto ClipLocal = [&](const FBoneReference& Bone) -> FQuat
	{
		return Bone.IsValidToEvaluate()
			? Pose.GetLocalSpaceTransform(Bone.GetCompactPoseIndex(Container)).GetRotation()
			: FQuat::Identity;
	};
	const FQuat ClipUpperArmL = ClipLocal(LeftUpperArm);
	const FQuat ClipUpperArmR = ClipLocal(RightUpperArm);
	const FQuat ClipHandL = ClipLocal(LeftHand);
	const FQuat ClipHandR = ClipLocal(RightHand);
	const FQuat ClipLowerArmL = ClipLocal(LeftLowerArm);
	const FQuat ClipLowerArmR = ClipLocal(RightLowerArm);

	const float LeftWeight = SwingWeight(LeftFoot);
	const float RightWeight = SwingWeight(RightFoot);

	SolveLeg(Pose, LeftThigh, LeftCalf, LeftFoot,
		LeftFootCorrection * LeftWeight - FVector(0.0f, 0.0f, PelvisOffset), LeftFootNormal);
	SolveLeg(Pose, RightThigh, RightCalf, RightFoot,
		RightFootCorrection * RightWeight - FVector(0.0f, 0.0f, PelvisOffset), RightFootNormal);

	// Arms last, and off the chest as it actually ended up: the spine lean and
	// the landing dip have already moved it, so a weapon placed from the chest
	// rides those instead of floating clear of them.
	if (WeaponIKAlpha > KINDA_SMALL_NUMBER && Chest.IsValidToEvaluate())
	{
		const FTransform ChestTransform =
			Pose.GetComponentSpaceTransform(Chest.GetCompactPoseIndex(Container));
		const FTransform WeaponTransform = WeaponRelativeToChest * ChestTransform;

		SolveArm(Pose, RightUpperArm, RightLowerArm, RightHand,
			WeaponTransform.TransformPosition(RightGripLocal), RightElbowDirection,
			WeaponTransform.GetRotation() * RightHandGripRotation.Quaternion(), WeaponIKAlpha, WeaponIKAlpha);

		SolveArm(Pose, LeftUpperArm, LeftLowerArm, LeftHand,
			WeaponTransform.TransformPosition(LeftGripLocal), LeftElbowDirection,
			WeaponTransform.GetRotation() * LeftHandGripRotation.Quaternion(), WeaponIKAlpha, WeaponIKAlpha);
	}

	// Support hand to the socket the weapon carries.
	//
	// One transform per weapon, solved to with the same two-bone IK the rest of
	// the body uses. What this replaces was a solver that modelled the fore-end
	// as an elliptical cross-section and bisection-searched each finger for
	// contact: hundreds of lines answering by measurement a question an artist
	// answers by dragging a gizmo, and it never held a rifle convincingly.
	if (LeftHandIKAlpha > KINDA_SMALL_NUMBER && bHasSupportSocket
		&& WeaponHand.IsValidToEvaluate() && LeftUpperArm.IsValidToEvaluate())
	{
		const FTransform HandTransform =
			Pose.GetComponentSpaceTransform(WeaponHand.GetCompactPoseIndex(Container));
		const FTransform WeaponToComponent = WeaponRelativeToHand * HandTransform;

		// The socket says how the hand meets the wood; the arm says how far
		// along it. Taken from the shoulder as the pose actually has it, so a
		// character leaning or turning slides its own hold rather than reaching
		// for a point fixed when the weapon was authored.
		const FVector Shoulder =
			Pose.GetComponentSpaceTransform(LeftUpperArm.GetCompactPoseIndex(Container)).GetLocation();
		FTransform Placed = SupportHandSocket;
		Placed.SetLocation(FVector(
			ChooseGripAlong(Container, WeaponToComponent, Shoulder, SupportHandSocket.GetLocation().X),
			SupportHandSocket.GetLocation().Y, SupportHandSocket.GetLocation().Z));

		// Contact sits on the section, not below it: the standing-off is the
		// hand's business and is applied as the wrist offset once the hand's
		// own frame is known.
		if (GGripDerive != 0)
		{
			Placed.SetLocation(FVector(Placed.GetLocation().X, 0.0f, ForeEndCentreHeight));
		}

		const FTransform Socket = Placed * WeaponToComponent;
		SolvedSupportSocket = Placed;

		// The fingers are a pose, still, and independent of where the hand is
		// put: a grip is the same shape wherever the weapon happens to be.
		SampleGripPose(Container);

		// The socket's rotation is a turn about the weapon's own axes, applied
		// on top of the wrist the clip authored -- not a replacement for it.
		//
		// Written as a replacement it read as a search with no landmark in it:
		// setting the hand's component rotation to the weapon's own puts the
		// bone axes on the weapon axes, which points the fingers down the
		// barrel, so identity is not "near correct" and no single value of roll
		// walks out of it. As a delta, identity is the hold the animator gave
		// and roll is what it says -- the hand turned about the barrel.
		const FQuat WeaponRotation = WeaponToComponent.GetRotation();
		const FQuat SocketDelta =
			(WeaponRotation * SupportHandSocket.GetRotation() * WeaponRotation.Inverse()).GetNormalized();

		// The frame first, the trim second. Where the derivation succeeds the
		// socket's own rotation stops being the answer and becomes a correction
		// to it -- which is the difference between a number that has to be found
		// for every weapon and one that only exists when a weapon is unusual.
		// Compared in component space, because the two candidate frames differ by
		// half a turn about the palm and a bone-local rotation does not say which
		// way a hand is actually facing on the body.
		const FQuat ClipHandWorld = LeftHand.IsValidToEvaluate()
			? Pose.GetComponentSpaceTransform(LeftHand.GetCompactPoseIndex(Container)).GetRotation()
			: FQuat::Identity;

		FQuat Derived = FQuat::Identity;
		FVector WristOffset = FVector::ZeroVector;
		const bool bDerived =
			DeriveGripRotation(Container, WeaponRotation, ClipHandWorld, Derived, WristOffset);

		// The socket names where the hand meets the wood; the offset carries the
		// wrist back off it by the hand's own length and depth, so the palm ends
		// up on the surface rather than the wrist joint.
		const FVector Target = Socket.GetLocation() + WristOffset;

		SolveArm(Pose, LeftUpperArm, LeftLowerArm, LeftHand,
			Target, LeftElbowDirection, Derived,
			LeftHandIKAlpha, bDerived ? LeftHandIKAlpha : 0.0f, SocketDelta);
	}

	// The support hand trimmed onto this particular weapon.
	//
	// A translation in component space rather than a solve: the hand keeps
	// every angle the animator gave it and only sits somewhere slightly else.
	// Applied here, before the pose goes back to local space, so everything
	// below the wrist travels with it.
	if (!SupportHandTrim.IsNearlyZero() && LeftHand.IsValidToEvaluate())
	{
		const FCompactPoseBoneIndex TrimIndex = LeftHand.GetCompactPoseIndex(Container);
		FTransform Trimmed = Pose.GetComponentSpaceTransform(TrimIndex);
		Trimmed.AddToTranslation(SupportHandTrim);
		Pose.SetComponentSpaceTransform(TrimIndex, Trimmed);
	}

	// The roll each hand gained over the clip, about its own length, signed.
	//
	// Taken here, while the pose is still assembled and the clip locals are
	// still to hand, and spent below once the pose is back in local space --
	// the twist bones are never converted to component space, so writing them
	// there would mean reconstructing a parent chain to no purpose.
	auto AddedRoll = [&](const FBoneReference& Bone, const FQuat& Clip) -> float
	{
		if (!Bone.IsValidToEvaluate())
		{
			return 0.0f;
		}
		const FQuat Delta =
			(Pose.GetLocalSpaceTransform(Bone.GetCompactPoseIndex(Container)).GetRotation()
				* Clip.Inverse()).GetNormalized();
		const FVector Vec(Delta.X, Delta.Y, Delta.Z);
		FQuat Roll(Vec | FVector::ForwardVector, 0.0f, 0.0f, Delta.W);
		if (Roll.SizeSquared() < KINDA_SMALL_NUMBER)
		{
			return 0.0f;
		}
		Roll.Normalize();
		if (Roll.W < 0.0f)
		{
			Roll = FQuat(-Roll.X, -Roll.Y, -Roll.Z, -Roll.W);
		}
		const float Degrees =
			FMath::RadiansToDegrees(2.0f * FMath::Acos(FMath::Clamp(Roll.W, -1.0f, 1.0f)));
		return Roll.X < 0.0f ? -Degrees : Degrees;
	};
	// Measured against the reference pose, not against the clip.
	//
	// The clip is the problem, not a baseline to preserve: measured in the
	// source FBX, hand_l carries 54 degrees of axial roll while lowerarm_l
	// carries 8. A forearm rotates in the radius and ulna, so a hand rolled
	// that far should bring most of the forearm with it; here the whole turn is
	// taken by the wrist joint and the skin shears across it. Spreading it down
	// the twist bones is what those bones exist for, and it is the authored
	// roll that needs spreading -- an earlier version fed this the roll the
	// solver added, which is a rounding error beside the clip's own.
	auto RefLocal = [&](const FBoneReference& Bone) -> FQuat
	{
		return Bone.IsValidToEvaluate()
			? Container.GetRefPoseTransform(Bone.GetCompactPoseIndex(Container)).GetRotation()
			: FQuat::Identity;
	};
	LeftHandRollAdded = AddedRoll(LeftHand, RefLocal(LeftHand));
	RightHandRollAdded = AddedRoll(RightHand, RefLocal(RightHand));

	// How sharply each hand meets its own forearm. Frame-independent and the
	// same question a viewer asks: a wrist carries maybe fifty degrees between
	// the forearm and the line of the hand, and past that it reads as a break.
	// Both hands, because they are solved by different things -- the left by the
	// grip solve, the right by the clip alone -- and a screenshot does not say
	// which one is wrong.
	if (GGripTrace > 0)
	{
		auto WristBend = [&](const FBoneReference& Elbow, const FBoneReference& Hand,
			const TArray<FBoneReference>& Fingers) -> float
		{
			if (!Elbow.IsValidToEvaluate() || !Hand.IsValidToEvaluate() || Fingers.Num() < 4
				|| !Fingers[3].IsValidToEvaluate())
			{
				return -1.0f;
			}
			const FVector ElbowLoc = Pose.GetComponentSpaceTransform(Elbow.GetCompactPoseIndex(Container)).GetLocation();
			const FVector WristLoc = Pose.GetComponentSpaceTransform(Hand.GetCompactPoseIndex(Container)).GetLocation();
			const FVector KnuckleLoc = Pose.GetComponentSpaceTransform(Fingers[3].GetCompactPoseIndex(Container)).GetLocation();
			const FVector Fore = (WristLoc - ElbowLoc).GetSafeNormal();
			const FVector Palm = (KnuckleLoc - WristLoc).GetSafeNormal();
			if (Fore.IsNearlyZero() || Palm.IsNearlyZero())
			{
				return -1.0f;
			}
			return FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(Fore | Palm, -1.0f, 1.0f)));
		};

		// Whether each forearm bone still points along its own bone. The IK moves
		// the wrist and rewrites the bone rotations, and if the two stop agreeing
		// the hand is hung off an axis that is not the arm it appears to be on.
		auto BoneSkew = [&](const FBoneReference& Elbow, const FBoneReference& Hand) -> float
		{
			if (!Elbow.IsValidToEvaluate() || !Hand.IsValidToEvaluate())
			{
				return -1.0f;
			}
			const FTransform ElbowT = Pose.GetComponentSpaceTransform(Elbow.GetCompactPoseIndex(Container));
			const FVector Line =
				(Pose.GetComponentSpaceTransform(Hand.GetCompactPoseIndex(Container)).GetLocation()
					- ElbowT.GetLocation()).GetSafeNormal();
			const FVector Axis = ElbowT.GetRotation().GetForwardVector().GetSafeNormal();
			if (Line.IsNearlyZero() || Axis.IsNearlyZero())
			{
				return -1.0f;
			}
			return FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(Line | Axis, -1.0f, 1.0f)));
		};

		// How far the forearm has been rolled about its own length from the clip.
		float ForearmRoll = -1.0f;
		if (LeftLowerArm.IsValidToEvaluate())
		{
			const FTransform NowT = Pose.GetComponentSpaceTransform(LeftLowerArm.GetCompactPoseIndex(Container));
			const FVector Along = NowT.GetRotation().GetForwardVector().GetSafeNormal();
			const FQuat Diff = (NowT.GetRotation() * ClipForearm.Inverse()).GetNormalized();
			const FVector Vec(Diff.X, Diff.Y, Diff.Z);
			const FVector Proj = Along * (Vec | Along);
			FQuat Twist(Proj.X, Proj.Y, Proj.Z, Diff.W);
			if (Twist.SizeSquared() < KINDA_SMALL_NUMBER)
			{
				Twist = FQuat::Identity;
			}
			Twist.Normalize();
			ForearmRoll = FMath::RadiansToDegrees(Twist.GetAngle());
			if (ForearmRoll > 180.0f)
			{
				ForearmRoll = 360.0f - ForearmRoll;
			}
		}

		// How far each bone is rolled about its own length relative to its parent.
		// The twist bones exist to carry a share of the hand's roll so the skin
		// between them does not shear, and nothing here solves them: they hold
		// whatever the clip keyed. If a solved hand's roll pulls away from its
		// twist bone while the untouched right hand's does not, the pinch is in
		// the skinning and no joint angle will ever show it.
		auto AxialRoll = [&](const FBoneReference& Bone, const FQuat& Clip) -> float
		{
			if (!Bone.IsValidToEvaluate())
			{
				return -1.0f;
			}
			const FQuat Local =
				(Pose.GetLocalSpaceTransform(Bone.GetCompactPoseIndex(Container)).GetRotation()
					* Clip.Inverse()).GetNormalized();
			const FVector Vec(Local.X, Local.Y, Local.Z);
			const FVector Proj = FVector::ForwardVector * (Vec | FVector::ForwardVector);
			FQuat Roll(Proj.X, Proj.Y, Proj.Z, Local.W);
			if (Roll.SizeSquared() < KINDA_SMALL_NUMBER)
			{
				return 0.0f;
			}
			Roll.Normalize();
			float Deg = FMath::RadiansToDegrees(Roll.GetAngle());
			if (Deg > 180.0f)
			{
				Deg = 360.0f - Deg;
			}
			return Deg;
		};

		UE_LOG(LogKBVEFootIK, Display,
			TEXT("grip roll added vs clip: upperarm l %.1f r %.1f | lowerarm l %.1f r %.1f | hand l %+.1f r %+.1f, spread at %.2f"),
			AxialRoll(LeftUpperArm, ClipUpperArmL), AxialRoll(RightUpperArm, ClipUpperArmR),
			AxialRoll(LeftLowerArm, ClipLowerArmL), AxialRoll(RightLowerArm, ClipLowerArmR),
			LeftHandRollAdded, RightHandRollAdded, WristTwistShare);

		UE_LOG(LogKBVEFootIK, Display,
			TEXT("grip: forearm rolled %.1f deg from clip | wrist bend left %.1f right %.1f deg, forearm skew left %.1f right %.1f deg"),
			ForearmRoll,
			WristBend(LeftLowerArm, LeftHand, LeftFingers),
			WristBend(RightLowerArm, RightHand, RightFingers),
			BoneSkew(LeftLowerArm, LeftHand), BoneSkew(RightLowerArm, RightHand));
	}

	// Kept before the pose leaves component space, because the finger wrap needs
	// both and neither survives the conversion: the fingers are closed in local
	// space, but whether they have reached the wood is a question about where
	// they are on the character.
	const FTransform WrapHand = LeftHand.IsValidToEvaluate()
		? Pose.GetComponentSpaceTransform(LeftHand.GetCompactPoseIndex(Container))
		: FTransform::Identity;
	const FTransform WrapWeapon = WeaponHand.IsValidToEvaluate()
		? WeaponRelativeToHand * Pose.GetComponentSpaceTransform(WeaponHand.GetCompactPoseIndex(Container))
		: FTransform::Identity;
	const bool bCanWrap = LeftHand.IsValidToEvaluate() && WeaponHand.IsValidToEvaluate()
		&& LeftHandIKAlpha > KINDA_SMALL_NUMBER;

	FCSPose<FCompactPose>::ConvertComponentPosesToLocalPoses(MoveTemp(Pose), Output.Pose);

	// The roll the solve added at each wrist, paid down the forearm.
	//
	// This is what the twist bones are for and the clips key them flat, so
	// without this every degree of it is absorbed by the single span of skin
	// between the last of them and the hand: the wrist pinches and no joint
	// angle reports it, because every joint angle is correct. Each bone takes
	// the share its own distance from the elbow earns it, read off the pose
	// rather than assumed, since which of the two sits nearer the wrist is a
	// property of the skeleton and not something worth hard-coding.
	if (WristTwistShare > 0.0f)
	{
		auto SpreadTwist = [&](const FBoneReference& Hand, const FBoneReference& First,
			const FBoneReference& Second, float Degrees)
		{
			if (FMath::IsNearlyZero(Degrees) || !Hand.IsValidToEvaluate())
			{
				return;
			}
			const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
			const float Span = Output.Pose[Hand.GetCompactPoseIndex(Bones)].GetTranslation().Size();
			if (Span < KINDA_SMALL_NUMBER)
			{
				return;
			}
			for (const FBoneReference* Twist : {&First, &Second})
			{
				if (!Twist->IsValidToEvaluate())
				{
					continue;
				}
				const FCompactPoseBoneIndex Index = Twist->GetCompactPoseIndex(Bones);
				const float Fraction =
					FMath::Clamp(Output.Pose[Index].GetTranslation().Size() / Span, 0.0f, 1.0f);
				// Capped, because the magnitude is not trustworthy.
				//
				// The same roll measures -54 degrees in the source FBX and +117
				// here: Blender's bones run down Y against Unreal's X, and the
				// mannequin's A-pose rest is not the rest the clip was authored
				// against. The direction and the existence of the problem are
				// solid; the number is not, so it is bounded to what a forearm
				// can actually carry and left dialable.
				const float Spread = FMath::Clamp(Degrees * Fraction * WristTwistShare,
					-MaxForearmTwistDegrees, MaxForearmTwistDegrees);
				const FQuat Roll(FVector::ForwardVector, FMath::DegreesToRadians(Spread));
				Output.Pose[Index].SetRotation((Output.Pose[Index].GetRotation() * Roll).GetNormalized());
			}
		};

		SpreadTwist(LeftHand, LeftForearmTwist, LeftForearmTwist2, LeftHandRollAdded);
		SpreadTwist(RightHand, RightForearmTwist, RightForearmTwist2, RightHandRollAdded);
	}

	// After the conversion back, because a finger curl is a local rotation and
	// nothing downstream reads it in component space.
	if (WeaponIKAlpha > KINDA_SMALL_NUMBER)
	{
		PoseFingers(Output.Pose, LeftFingers, WeaponIKAlpha);
		PoseFingers(Output.Pose, RightFingers, WeaponIKAlpha);
	}

	// The authored pose, written straight onto the fingers. A rotation per joint
	// like everything else here, so it can be blended out and cannot dislocate
	// anything -- and it replaces rather than adds, because the pose is the
	// whole answer for the fingers rather than a correction to the clip's.
	if (bGripPoseSampled && GripPoseLocals.Num() == LeftFingers.Num()
		&& LeftHandIKAlpha > KINDA_SMALL_NUMBER)
	{
		const float PoseWeight =
			FMath::Clamp(SupportHandPoseWeight, 0.0f, 1.0f) * FMath::Clamp(LeftHandIKAlpha, 0.0f, 1.0f);
		for (int32 Index = 0; Index < LeftFingers.Num(); ++Index)
		{
			const FBoneReference& Finger = LeftFingers[Index];
			if (!Finger.IsValidToEvaluate())
			{
				continue;
			}
			const FCompactPoseBoneIndex BoneIndex = Finger.GetCompactPoseIndex(Container);
			Output.Pose[BoneIndex].SetRotation(FQuat::Slerp(Output.Pose[BoneIndex].GetRotation(),
				GripPoseLocals[Index].GetRotation(), PoseWeight).GetNormalized());
		}
	}

	// Independent of the procedural hold: this one corrects a clip that already
	// poses the hand, rather than posing one that is not held at all.
	CurlFingers(Output.Pose, LeftFingers, LeftGripCurlDegrees, LeftGripThumbDegrees);

	// Last, so it closes whatever hand the steps above ended with. The authored
	// pose says what shape the hand makes; this says how far that shape has to
	// travel to reach a fore-end none of those steps has measured.
	if (bCanWrap)
	{
		WrapFingers(Output.Pose, Container, WrapHand, WrapWeapon);
	}

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

	// Weapon hold, blended so raising and lowering the rifle reads as a movement.
	const float WeaponStep = WeaponBlendTime > KINDA_SMALL_NUMBER
		? DeltaSeconds / WeaponBlendTime : 1.0f;
	WeaponAlpha = FMath::Clamp(WeaponAlpha + (bHoldWeapon ? WeaponStep : -WeaponStep), 0.0f, 1.0f);

	Proxy.WeaponIKAlpha = WeaponAlpha;
	Proxy.WeaponRelativeToChest = WeaponRelativeToChest;
	Proxy.RightGripLocal = RightGripLocal;
	Proxy.LeftGripLocal = LeftGripLocal;
	Proxy.RightElbowDirection = RightElbowDirection;
	Proxy.LeftElbowDirection = LeftElbowDirection;
	Proxy.RightHandGripRotation = RightHandGripRotation;
	Proxy.LeftHandGripRotation = LeftHandGripRotation;
	Proxy.FingerCurlDegrees = FingerCurlDegrees;
	Proxy.ThumbCurlDegrees = ThumbCurlDegrees;
	Proxy.WeaponHand.BoneName = WeaponHandBone;
	Proxy.WeaponRelativeToHand = WeaponRelativeToHand;
	Proxy.LeftHandTargetLocal = LeftHandTargetLocal;
	Proxy.LeftHandRollDegrees = GGripRoll > -999.0f ? GGripRoll : LeftHandRollDegrees;
	Proxy.WeaponBoreHeight = WeaponBoreHeight;
	Proxy.LeftHandIKAlpha = bSolveLeftHandToWeapon ? LeftHandIKAlpha : 0.0f;
	Proxy.LeftGripCurlDegrees = GGripCurl > -999.0f ? GGripCurl : LeftGripCurlDegrees;
	Proxy.LeftGripThumbDegrees = GGripThumb > -999.0f ? GGripThumb : LeftGripThumbDegrees;
	Proxy.bGripSolveFingers = GGripFingers >= 0 ? GGripFingers != 0 : bGripSolveFingers;
	Proxy.ForeEndHalfWidth = GGripWidth > -999.0f ? GGripWidth : ForeEndHalfWidth;
	Proxy.ForeEndHalfHeight = GGripHeight > -999.0f ? GGripHeight : ForeEndHalfHeight;
	Proxy.ForeEndCentreHeight = GGripCentre > -999.0f ? GGripCentre : ForeEndCentreHeight;
	Proxy.GripWristOffset = GripWristOffset;
	Proxy.GripKnuckleClearance = GripKnuckleClearance;
	Proxy.GripAlongBarrel = GGripAlong > -999.0f ? GGripAlong : GripAlongBarrel;
	Proxy.GripAlongMin = GripAlongMin;
	Proxy.GripAlongMax = GripAlongMax;
	Proxy.GripArmExtension = GGripAlong > -999.0f ? 0.0f : GripArmExtension;
	Proxy.GripFingerLeanDegrees = GGripLean > -999.0f ? GGripLean : GripFingerLeanDegrees;
	Proxy.MaxGripTwistDegrees = GGripTwist > -999.0f ? GGripTwist : MaxGripTwistDegrees;
	Proxy.MaxWristRollDegrees = GGripRoll2 > -999.0f ? GGripRoll2 : MaxWristRollDegrees;
	Proxy.MaxWristBendDegrees = GGripBend > -999.0f ? GGripBend : MaxWristBendDegrees;

	// The weapon's own numbers win over the fallback defaults. A rifle is
	// described by its asset; the loose properties are what a rifle without one
	// falls back to.
	if (WeaponGrip)
	{
		Proxy.ForeEndHalfWidth = WeaponGrip->ForeEndHalfWidth;
		Proxy.ForeEndHalfHeight = WeaponGrip->ForeEndHalfHeight;
		Proxy.ForeEndCentreHeight = WeaponGrip->ForeEndCentreHeight;
		Proxy.GripKnuckleClearance = WeaponGrip->KnuckleClearance;
		Proxy.GripBoreAngleDegrees = WeaponGrip->GripAngleDegrees;
		if (GGripAlong <= -999.0f)
		{
			Proxy.GripAlongBarrel = WeaponGrip->GripAlongBarrel;
		}
		if (Proxy.SupportHandPose != WeaponGrip->SupportHandPose)
		{
			Proxy.SupportHandPose = WeaponGrip->SupportHandPose;
			Proxy.bGripPoseSampled = false;
		}
		Proxy.RightGripLocal = WeaponGrip->RightGripLocal;
		Proxy.LeftGripLocal = WeaponGrip->LeftGripLocal;
		Proxy.LeftHandTargetLocal = WeaponGrip->LeftHandTargetLocal;
		Proxy.SupportHandSocket = WeaponGrip->SupportHandSocket;
		Proxy.GripAlongMin = WeaponGrip->GripAlongMin;
		Proxy.GripAlongMax = WeaponGrip->GripAlongMax;
		Proxy.GripArmExtension = WeaponGrip->GripArmExtension;

		// A socket with no position is unset, and an unset socket would drag the
		// hand to the weapon's origin. The rotation says nothing about this: it
		// is a delta now, and a delta of identity is a hold, not an absence.
		Proxy.bHasSupportSocket = !WeaponGrip->SupportHandSocket.GetLocation().IsNearlyZero();

		// Each axis dialled on its own, over whatever the asset carries, so
		// finding roll does not silently throw away an authored pitch.
		if (GSocketPitch > -999.0f || GSocketYaw > -999.0f || GSocketRoll > -999.0f)
		{
			const FRotator Authored = WeaponGrip->SupportHandSocket.Rotator();
			Proxy.SupportHandSocket.SetRotation(FRotator(
				GSocketPitch > -999.0f ? GSocketPitch : Authored.Pitch,
				GSocketYaw > -999.0f ? GSocketYaw : Authored.Yaw,
				GSocketRoll > -999.0f ? GSocketRoll : Authored.Roll).Quaternion());
		}

		if (GSocketX > -999.0f || GSocketY > -999.0f || GSocketZ > -999.0f)
		{
			const FVector Authored = WeaponGrip->SupportHandSocket.GetLocation();
			Proxy.SupportHandSocket.SetLocation(FVector(
				GSocketX > -999.0f ? GSocketX : Authored.X,
				GSocketY > -999.0f ? GSocketY : Authored.Y,
				GSocketZ > -999.0f ? GSocketZ : Authored.Z));
			Proxy.bHasSupportSocket = true;
		}

		// Published for the debug draw, after the console has had its say. The
		// asset's own value is the wrong thing to draw while a socket is being
		// dialled: it would mark where the hand used to be told to go.
		// The last evaluation's, when there has been one: the arm picks where
		// along the wood to hold, so the authored socket is an input to that
		// choice rather than the answer to it.
		ResolvedSupportSocket = Proxy.SolvedSupportSocket.Equals(FTransform::Identity)
			? Proxy.SupportHandSocket
			: Proxy.SolvedSupportSocket;
		bResolvedSupportSocketValid = Proxy.bHasSupportSocket;
		Proxy.SupportHandTrim = WeaponGrip->SupportHandTrim
			+ FVector(GGripTrimX > -999.0f ? GGripTrimX : 0.0f,
				GGripTrimY > -999.0f ? GGripTrimY : 0.0f,
				GGripTrimZ > -999.0f ? GGripTrimZ : 0.0f);
		Proxy.SupportHandPoseTime = WeaponGrip->SupportHandPoseTime;
		Proxy.SupportHandPoseWeight = WeaponGrip->SupportHandPoseWeight;

		// Flattened into the order the finger bones are built in below, so a
		// grip can be written per chain and read per joint. Rebuilt only when
		// it changes shape, since resampling throws away nothing else.
		TArray<float> Angles;
		Angles.Reserve(FingerChainCount * JointsPerFinger);
		for (const TCHAR* Chain : GFingerChains)
		{
			const FKBVEGripFinger* Finger = WeaponGrip->FingerPose.FindByPredicate(
				[Chain](const FKBVEGripFinger& Candidate)
				{
					return Candidate.Chain == FName(Chain);
				});
			Angles.Add(Finger ? Finger->Base : 0.0f);
			Angles.Add(Finger ? Finger->Middle : 0.0f);
			Angles.Add(Finger ? Finger->Tip : 0.0f);
		}
		if (Proxy.GripFingerAngles != Angles)
		{
			Proxy.GripFingerAngles = MoveTemp(Angles);
			Proxy.bGripPoseSampled = false;
		}
	}
	if (GGripBoreAngle > -999.0f)
	{
		Proxy.GripBoreAngleDegrees = GGripBoreAngle;
	}
	else if (!WeaponGrip)
	{
		Proxy.GripBoreAngleDegrees = LeftGripBoreAngleDegrees;
	}
	Proxy.FingertipLength = FingertipLength;
	Proxy.MaxGripCurlDegrees = MaxGripCurlDegrees;
	Proxy.ThumbCurlScale = ThumbCurlScale;
	if (GGripAxis >= 0)
	{
		static const FVector Axes[3] = { FVector::ForwardVector, FVector::RightVector, FVector::UpVector };
		Proxy.FingerCurlAxis = Axes[GGripAxis % 3] * (GGripAxis >= 3 ? -1.0f : 1.0f);
	}
	else
	{
		Proxy.FingerCurlAxis = FingerCurlAxis;
	}
	Proxy.Chest.BoneName = ChestBone;
	Proxy.LeftUpperArm.BoneName = TEXT("upperarm_l");
	Proxy.LeftLowerArm.BoneName = TEXT("lowerarm_l");
	Proxy.LeftHand.BoneName = TEXT("hand_l");
	Proxy.RightUpperArm.BoneName = TEXT("upperarm_r");
	Proxy.RightLowerArm.BoneName = TEXT("lowerarm_r");
	Proxy.RightHand.BoneName = TEXT("hand_r");
	Proxy.LeftForearmTwist.BoneName = TEXT("lowerarm_twist_01_l");
	Proxy.LeftForearmTwist2.BoneName = TEXT("lowerarm_twist_02_l");
	Proxy.RightForearmTwist.BoneName = TEXT("lowerarm_twist_01_r");
	Proxy.RightForearmTwist2.BoneName = TEXT("lowerarm_twist_02_r");
	Proxy.WristTwistShare = GWristTwistShare > -999.0f ? GWristTwistShare : WristTwistShare;
	Proxy.MaxForearmTwistDegrees = MaxForearmTwistDegrees;

	// Read back from the last evaluation, so the component can follow the swing
	// the solve applied. One frame behind, which at animation rates is not a
	// thing an eye resolves.

	// Built once. The names are the UE mannequin's, and every joint of every
	// finger is listed because a curl applied only to the knuckle leaves the
	// hand flat with a bent base.
	if (Proxy.LeftFingers.Num() == 0)
	{
		Proxy.FingersPerHand = JointsPerFinger;
		for (const TCHAR* Chain : GFingerChains)
		{
			for (int32 Joint = 1; Joint <= JointsPerFinger; ++Joint)
			{
				FBoneReference Left;
				Left.BoneName = FName(*FString::Printf(TEXT("%s_0%d_l"), Chain, Joint));
				Proxy.LeftFingers.Add(Left);

				FBoneReference Right;
				Right.BoneName = FName(*FString::Printf(TEXT("%s_0%d_r"), Chain, Joint));
				Proxy.RightFingers.Add(Right);
			}
		}
	}

	Proxy.RequestedClip = PendingClip;
	Proxy.RequestedPlayRate = PendingPlayRate;
	Proxy.ClipBlendTime = ClipBlendTime;
}
