#pragma once

#include "CoreMinimal.h"
#include "KBVEMoverPawn.h"

class UAnimSequence;
class USkeletalMeshComponent;

#include "RareIconPlayerPawn.generated.h"

/**
 * The player character.
 *
 * All of the movement, camera and input plumbing lives in AKBVEMoverPawn, which
 * is shared across KBVE games and runs server-authoritative Mover with client
 * prediction. This subclass only supplies what is specific to RareIcon: which
 * mesh, which animation blueprint, and which input assets to bind.
 *
 * Those are wired here rather than in a Blueprint so the values show up in a
 * diff -- a pawn Blueprint would put the same six object references in a binary
 * asset nobody can review.
 */
UCLASS()
class ARareIconPlayerPawn : public AKBVEMoverPawn
{
	GENERATED_BODY()

public:
	ARareIconPlayerPawn(const FObjectInitializer& ObjectInitializer);

	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;

	/**
	 * Log where the capsule, the collision surface, the analytic terrain and the
	 * foot bone actually are. Each number isolates a different cause of the
	 * character not standing on the ground, which is otherwise four
	 * indistinguishable symptoms.
	 */
	void ReportFeet() const;

	/** Speed, cm/s, at which walking gives way to running. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float RunSpeedThreshold = 320.0f;

	/**
	 * Speed the character must fall back below before running gives way to
	 * walking again. Without the gap a speed sitting on the threshold flips
	 * the clip every few frames, and each flip restarts a blend that the next
	 * one interrupts.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float RunExitSpeedThreshold = 210.0f;

	/**
	 * Shortest time a locomotion clip is held before another may replace it.
	 * Decelerating from a run to a stop crosses every gait threshold in under
	 * a tenth of a second, and blending through all of them reads as mush.
	 * Leaving the ground ignores this: falling has to be immediate.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float MinClipDwellTime = 0.12f;

	/**
	 * Held at least as long as a crossfade takes, whatever the value above.
	 *
	 * There are two sequence players, so a clip change arriving while a blend
	 * is still running overwrites the pose that blend was fading out of, and
	 * the character jumps. Decelerating to a stop crosses two gait thresholds
	 * in under a tenth of a second, so this is not a rare case -- it fired on
	 * every landing, as a five to nine centimetre pop in both feet at once.
	 */
	float EffectiveDwellTime() const;

	/**
	 * Play-rate limits. A walk clip driven far past its authored speed reads as
	 * a sprinting walk rather than a run, which is worse than the foot sliding
	 * the scaling was meant to hide.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float MinClipPlayRate = 0.6f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float MaxClipPlayRate = 1.6f;

	/** Speed below which the character is treated as standing still. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float MoveSpeedThreshold = 10.0f;

	/** Vertical speed beyond which the fall loop plays. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float FallSpeedThreshold = 200.0f;

	/**
	 * How long before touchdown the ground clip is picked, in seconds.
	 *
	 * The fall loop holds the legs tucked, so a character that plays it until
	 * the frame it lands arrives with its feet tens of centimetres in the air
	 * and has to sweep them down afterwards -- which is what reads as the legs
	 * snapping on landing. No blend fixes that, because the pose is simply
	 * wrong for the moment of contact. Leaving the fall clip early means the
	 * legs are already reaching for the ground when the character gets there.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float LandingAnticipationTime = 0.18f;

	/**
	 * Ground speed each locomotion clip was authored at, for play-rate scaling.
	 *
	 * Measured from the clips rather than estimated: the root travels 786.67 cm
	 * over the 3.933 s walk and 1216.67 cm over the 2.433 s run, which is 200
	 * and 500 cm/s exactly. A play rate computed against a guessed authoring
	 * speed is what makes feet skate.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float WalkClipSpeed = 200.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float RunClipSpeed = 500.0f;

	/**
	 * Bone the weapon rides on, and where it sits relative to that bone.
	 *
	 * Attached to hand_r, not to weapon_r.
	 *
	 * weapon_r is the bone that exists for exactly this and the rifle clips do
	 * animate it -- but SKM_Manny_Simple does not skin it. Its skeleton asset
	 * lists 161 bones and the mesh carries a subset, so the lookup fails, and a
	 * failed socket lookup is silent: the component attaches to its parent's
	 * origin instead. On this pawn that origin is the capsule bottom, so the
	 * rifle lay on the ground looking like a bad offset rather than a missing
	 * bone. ReportFeet logs the bone index for that reason.
	 *
	 * The rotation is the Game Animation Sample's own convention rather than a
	 * fit: weapon_r carries the orientation those clips expect a weapon to take,
	 * and its X axis runs back down the weapon toward the butt. This rifle is
	 * modelled muzzle on +X and scope on +Z, so the mapping is a half turn about
	 * Z and nothing else -- which is why the rotation is exactly 180 and holds
	 * to the degree across the whole idle loop.
	 *
	 * Fitting it to the hands instead does not work, and the failure is worth
	 * recording. Aligning the barrel to the hand_r -> hand_l vector puts it 31
	 * degrees across the body, because a hand bone sits at the wrist and the
	 * wrist is offset from whatever the hand is wrapped around: the left wrist
	 * measures 8.8 cm off the barrel's centreline while that hand's knuckles sit
	 * 1.5 cm off it, on the fore-end, holding the weapon correctly.
	 *
	 * The translation puts the measured wrist of the stock on weapon_r, which is
	 * 3.4 cm from hand_r -- the palm rather than the wrist joint.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Weapon")
	FName WeaponAttachBone = TEXT("hand_r");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Weapon")
	FTransform WeaponAttachOffset = FTransform(
		FRotator(0.0f, 180.0f, 0.0f), FVector(-36.80f, 3.41f, -0.38f));

	/**
	 * Solve the weapon hold procedurally instead of taking it from the clip.
	 *
	 * Off: the rifle set animates the hold. Worth having for a character with no
	 * authored hold, and worth never having on at the same time as one -- both
	 * write the same arm bones.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Weapon")
	bool bUseProceduralWeaponHold = false;

	/** The weapon itself. Skeletal because its bolt and trigger are bones. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "RareIcon|Weapon")
	TObjectPtr<USkeletalMeshComponent> WeaponMesh;

private:
	/** Seconds after possession to log ReportFeet once, so a headless run captures it. */
	static constexpr float FeetReportDelay = 3.0f;
	static constexpr float FeetReportInterval = 1.0f;
	static constexpr int32 FeetReportCount = 1;

	float TimeSinceBeginPlay = 0.0f;
	int32 FeetReportsDone = 0;
	bool bAutoShotTaken = false;

	/** Pick the clip for the current velocity and play it if it is not already. */
	void UpdateLocomotionAnimation(float DeltaSeconds);

	/** Whether the ground is close enough to start playing the landing pose. */
	bool IsAboutToLand(float DescentSpeed) const;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> IdleAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> WalkAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> RunAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> FallAnim;

	UPROPERTY(Transient)
	TObjectPtr<UAnimSequence> CurrentAnim;

	/** Gait latch and dwell timer, so a decelerating stop picks one clip. */
	bool bRunning = false;
	float TimeInCurrentClip = 0.0f;
};
