#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KBVEWeaponGrip.generated.h"

class UAnimSequence;

/**
 * One finger's shape in a grip, as the angle each of its three joints closes.
 *
 * Degrees about the joint's own bend axis, applied over the skeleton's
 * reference pose rather than over the clip -- a grip is a shape the hand makes,
 * and it has to come out the same whether the character is walking, idling or
 * landing. Positive closes.
 */
USTRUCT(BlueprintType)
struct FKBVEGripFinger
{
	GENERATED_BODY()

	/** index, middle, ring, pinky or thumb. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	FName Chain;

	/** Knuckle, second joint, fingertip joint. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float Base = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float Middle = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float Tip = 0.0f;
};

/**
 * One slice of a weapon's underside, at a position along its length.
 *
 * A rifle is not a tube and its fore-end is not an ellipse: it swells at the
 * barrel band, steps down at the receiver, stops altogether past the muzzle. A
 * single cross-section stated once describes exactly one place on the weapon,
 * so a finger measured against it is measured against wood that may not be
 * there -- which is the whole reason the wrap solver was switched off.
 *
 * These are measured off the mesh rather than typed, one per centimetre, and
 * they describe the lowest connected body at that station: a support hand
 * arrives from underneath, so what it touches is the underside, not whatever
 * optic happens to share the slice.
 *
 * Cut from the triangles, not gathered from the vertices. A rifle's woodwork is
 * a handful of long flat faces, so whole centimetres of it carry no vertex at
 * all -- reading the cloud gave a Mosin fore-end one centimetre tall with holes
 * through the middle of it, because that is honestly what the vertices there
 * say. Intersecting each triangle with the slice plane gives the outline the
 * surface actually has.
 */
USTRUCT(BlueprintType)
struct FKBVEGripSlab
{
	GENERATED_BODY()

	/** Where along the weapon's own X this slice was taken. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float X = 0.0f;

	/**
	 * Centre of the slice, across and up the weapon's own axes.
	 *
	 * Across as well as up, because a rifle is not symmetric about its own
	 * origin: the bolt handle stands off one side and the Mosin's fore-end
	 * measures three centimetres of it. A section assumed centred on zero puts
	 * the hand a centimetre out on any weapon whose mesh was not built about
	 * the bore.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float CentreY = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float CentreZ = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float HalfWidth = 0.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip")
	float HalfHeight = 0.0f;
};

/**
 * Everything the support hand needs to know about one weapon.
 *
 * A data asset per weapon rather than constants on the anim instance, because
 * the numbers below are properties of a rifle and not of a character: a second
 * weapon is a second asset, not a second set of tuned defaults. Every field is
 * measurable off the mesh -- the section is a cross-section of the fore-end,
 * the grip point is a position along it -- so a new weapon is measured rather
 * than dialled in by eye.
 *
 * The finger pose is authored and referenced here rather than solved. Solving
 * it against the section was tried at length: contact distance is satisfied by
 * poses no hand can hold, because it says nothing about wrist angle, how curl
 * distributes across the joints, or what the thumb opposes. A pose carries all
 * of that at once.
 */
UCLASS(BlueprintType)
class KBVEMOVER_API UKBVEWeaponGrip : public UDataAsset
{
	GENERATED_BODY()

public:
	/**
	 * The fore-end's cross-section, in the weapon's own space.
	 *
	 * Half-extents, because a rifle's fore-end is not round: it is a block of
	 * wood under the barrel, wider than it is deep or the other way about. For
	 * the Mosin these measure 2.1 by 3.5 with its centre 3.3 up, against a bore
	 * at 5.35 -- the fore-end and the barrel are not the same axis, and treating
	 * them as one puts the hand on the barrel.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float ForeEndHalfWidth = 2.1f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float ForeEndHalfHeight = 3.5f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float ForeEndCentreHeight = 3.3f;

	/**
	 * Where along the fore-end the support hand takes hold.
	 *
	 * Measured against the arm as much as the weapon: the Mosin's wood runs from
	 * about -18 to -4, and gripping the forward end of it puts the hold 52 cm
	 * from a 49 cm arm, so the solver straightens the arm and stops short. The
	 * rear of the fore-end is both where a support hand belongs and the part a
	 * shoulder can actually reach.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float GripAlongBarrel = -18.0f;

	/**
	 * Where the hand sits around the section, as atan2(z, y), degrees.
	 *
	 * Under and outboard, which is the side a left hand meets a rifle from.
	 * Under and inboard puts the hand across the weapon from the arm holding it
	 * and the wrist has to rotate twice as far to lay the palm on the wood --
	 * measured at 46 degrees against 20.7 here.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float GripAngleDegrees = 270.0f;

	/**
	 * How far the woodwork runs, along the weapon's own X.
	 *
	 * A range rather than the single point above, because where a hand lands on
	 * a fore-end is not a property of the rifle: it is where the arm holding it
	 * comfortably reaches, and that moves with the character. The rifle only
	 * says how much wood there is to choose from. Equal values pin the hold.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float GripAlongMin = -18.0f;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float GripAlongMax = -6.0f;

	/**
	 * How much of the arm's length the hold may use, as a fraction.
	 *
	 * Below one so the elbow keeps a bend: an arm solved to exactly its own
	 * length is straight, and a straight support arm reads as a mannequin
	 * holding a prop. Zero pins the hand at GripAlongMin.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float GripArmExtension = 0.92f;

	/** How far the knuckles are held off the surface, cm. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float KnuckleClearance = 0.6f;

	/**
	 * The weapon's underside, measured, a slice at a time.
	 *
	 * Written by the import pipeline from the mesh itself, so a weapon nobody
	 * has held describes its own fore-end. The three half-extents above stay as
	 * the average over the graspable run -- they are what a solver falls back
	 * to when a weapon predates this, and what the debug box draws -- but the
	 * fingers are closed against these.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	TArray<FKBVEGripSlab> ForeEndProfile;

	/** How far apart the slices are, cm. Zero means the profile is unusable. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float ProfileSlabWidth = 0.0f;

	/**
	 * Where each hand meets this weapon, in the weapon's own space.
	 *
	 * These lived on the anim instance as tuned constants, which made a second
	 * weapon impossible: the SS2-V5 came up held by its stock because it was
	 * being mounted on the Mosin's numbers. They are properties of a rifle --
	 * measured off the mesh, like the section above -- and belong with it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Hold")
	FVector RightGripLocal = FVector(-37.0f, 0.0f, 0.0f);

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Hold")
	FVector LeftGripLocal = FVector(-7.0f, 0.0f, -1.0f);

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Hold")
	FVector LeftHandTargetLocal = FVector(-4.0f, -7.0f, 5.7f);

	/**
	 * Where the support hand goes on this weapon: position and orientation, in
	 * the weapon's own space.
	 *
	 * One transform per weapon, placed by eye, and the arm is solved to it.
	 * This replaces a solver that modelled the fore-end as an elliptical
	 * section and bisection-searched for finger contact -- which is a great
	 * deal of machinery for a question an artist answers by dragging a gizmo,
	 * and it never produced a hold worth keeping.
	 *
	 * The rotation is a turn about the weapon's own axes, laid over the wrist
	 * the clip authored, rather than a wrist orientation in its own right. As
	 * an orientation it had no usable zero: a hand given the weapon's rotation
	 * wears the weapon's axes and points its fingers down the barrel, so no
	 * small value of roll is near anything. As a turn, zero is the animator's
	 * hold and roll is roll -- the hand rotated about the barrel, which is the
	 * one number the clip gets wrong on a weapon it was not authored for.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Hold")
	FTransform SupportHandSocket;

	/**
	 * A last nudge for the support hand, in the character's own space, cm.
	 *
	 * Every clip was authored around one weapon, and no weapon a game ships is
	 * that weapon. This is where the difference goes: the wrist a centimetre
	 * low, the hand a touch further out. Per weapon because the difference is
	 * per weapon, and applied whether or not anything else solves the hand, so
	 * a grip can be trimmed without turning a solver on to do it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Hold")
	FVector SupportHandTrim = FVector::ZeroVector;

	/** Where the weapon hangs off the trigger hand. Identity means "unset". */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Hold")
	FTransform AttachOffset;

	/**
	 * The support hand's shape, a joint angle at a time.
	 *
	 * Numbers in the weapon's config rather than a posed asset, because a grip
	 * is reviewable as numbers and a uasset is not: this is what tells a reader
	 * which knuckle closed further when the hold changed. Takes precedence over
	 * SupportHandPose when it is filled in.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Pose")
	TArray<FKBVEGripFinger> FingerPose;

	/**
	 * The support hand's finger pose, and the time it is read at.
	 *
	 * One frame of an animation rather than a bespoke asset type: a pose is a
	 * set of joint rotations, an AnimSequence already is that, and the rifle set
	 * already contains hands authored around a rifle. Point this at a clip
	 * posed for this weapon and the fingers come out right; leave it empty and
	 * the clip currently playing keeps its own fingers.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Pose")
	TObjectPtr<UAnimSequence> SupportHandPose;

	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Pose")
	float SupportHandPoseTime = 0.0f;

	/** How much of the authored pose to apply, for blending it in and out. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Pose")
	float SupportHandPoseWeight = 1.0f;
};
