#pragma once

#include "CoreMinimal.h"
#include "KBVEMoverPawn.h"

class UAnimSequence;

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

	/** Ground speed each locomotion clip was authored at, for play-rate scaling. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float WalkClipSpeed = 150.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "RareIcon|Animation")
	float RunClipSpeed = 500.0f;

private:
	/** Seconds after possession to log ReportFeet once, so a headless run captures it. */
	static constexpr float FeetReportDelay = 3.0f;
	static constexpr float FeetReportInterval = 1.0f;
	static constexpr int32 FeetReportCount = 1;

	float TimeSinceBeginPlay = 0.0f;
	int32 FeetReportsDone = 0;

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
