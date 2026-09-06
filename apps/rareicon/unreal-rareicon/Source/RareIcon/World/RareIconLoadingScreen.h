#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"

#include "RareIconLoadingScreen.generated.h"

class AKBVEWorldStreamer;
class SKBVELoadingPanel;

/**
 * What the player looks at while the world is being worked out.
 *
 * There is a wait at the start of every session and it is not incidental: the
 * seed is asked where the villages are, and then the ground under the one it
 * chose has to be built before anybody can be put on it. The streamer already
 * holds the pawn for exactly that long -- what it could not do is say so, so
 * the wait read as a game that had frozen on an empty grey frame.
 *
 * A subsystem rather than anything in the level, because it belongs to the
 * session and not to the map: no actor to place, nothing to forget to add to a
 * second level, and no widget left behind when a world is torn down.
 */
UCLASS()
class URareIconLoadingScreen : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;
	virtual void OnWorldBeginPlay(UWorld& InWorld) override;
	virtual void Deinitialize() override;

	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

private:
	void Hide();

	/** What the streamer is doing, in words, or empty while it has nothing to say. */
	FString Describe() const;

	TWeakObjectPtr<AKBVEWorldStreamer> Streamer;
	TSharedPtr<SKBVELoadingPanel> Panel;

	/**
	 * The deepest the queue has been, which is what the bar is a fraction of.
	 *
	 * Taken as a high-water mark rather than read once: the window is queued over
	 * several ticks, so a total sampled on the first frame is a total of the
	 * chunks queued so far and the bar walks backwards as more arrive.
	 */
	int32 Deepest = 0;

	FString Message;
};
