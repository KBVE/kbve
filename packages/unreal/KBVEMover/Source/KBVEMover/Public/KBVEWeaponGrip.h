#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "KBVEWeaponGrip.generated.h"

class UAnimSequence;

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

	/** Where the hand sits around the section, as atan2(z, y), degrees. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float GripAngleDegrees = 253.0f;

	/** How far the knuckles are held off the surface, cm. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Grip|Section")
	float KnuckleClearance = 0.6f;

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
