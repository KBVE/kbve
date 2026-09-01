#pragma once

#include "CoreMinimal.h"
#include "Containers/Ticker.h"
#include "Subsystems/EngineSubsystem.h"

#include "UnrChunkSubsystem.generated.h"

/**
 * Drives the `unr` chunk job surface from the game thread.
 *
 * Submitting queues work on the Rust side and returns a ticket immediately;
 * this subsystem drains completions once per tick and copies each payload into
 * an Unreal-owned buffer. The game thread never waits on a bake.
 *
 * An EngineSubsystem rather than a GameInstance one so it exists in the editor
 * without entering PIE -- the console commands are meant for exactly that.
 */
UCLASS()
class KBVEUNR_API UUnrChunkSubsystem : public UEngineSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Queue a chunk bake. Returns the ticket; does not block. */
	uint64 Submit(int32 Seed, int32 ChunkX, int32 ChunkY);

	/** Tickets submitted but not yet drained. */
	int32 GetOutstanding() const { return Outstanding.Num(); }

	/** Payloads successfully copied out since startup. */
	int32 GetReceived() const { return Received; }

	/** Completions that reported cancellation. */
	int32 GetCancelled() const { return Cancelled; }

	/** Checksum of the last payload -- proof the bytes actually arrived. */
	float GetLastChecksum() const { return LastChecksum; }

	/**
	 * Completions drained per tick. Caps how much chunk integration lands in a
	 * single frame, so a burst spreads across frames instead of spiking one.
	 */
	int32 MaxDrainPerTick = 8;

private:
	bool Tick(float DeltaTime);

	FTSTicker::FDelegateHandle TickerHandle;
	TSet<uint64> Outstanding;
	TArray<float> ScratchBuffer;

	int32 Received = 0;
	int32 Cancelled = 0;
	float LastChecksum = 0.0f;

	// Wall time from the first submit of a batch until the last completion
	// drains. The number that says whether the pool actually ran in parallel
	// with the game thread, rather than the game thread waiting on it.
	double BatchStartSeconds = 0.0;
	int32 BatchSubmitted = 0;
};
