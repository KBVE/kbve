#pragma once

#include "CoreMinimal.h"
#include "HAL/CriticalSection.h"
#include "Subsystems/EngineSubsystem.h"
#include "Containers/Ticker.h"
#include "KBVEPerfSubsystem.generated.h"

class IHttpRouter;
class IConsoleVariable;
struct FHttpRouteHandleInternal;

struct FKBVEPerfOpStat
{
	uint64 Count = 0;
	double LastMs = 0.0;
	double MaxMs = 0.0;
	double SumMs = 0.0;
	TArray<float> Samples;

	/**
	 * When each sample was taken, alongside the sample itself.
	 *
	 * Without it a readout describes the whole session: an average takes a
	 * viewer standing still and a viewer running through a village and reports
	 * the mean of the two, and a maximum is whatever the worst moment since the
	 * editor opened happened to be -- usually the first build of the world, kept
	 * forever. Neither answers "what is it doing now", which is the only
	 * question somebody watching a live readout is asking.
	 */
	TArray<double> SampleAt;
	int32 SampleHead = 0;
};

struct FKBVEPerfEvent
{
	FName Name;
	double Ms = 0.0;
	uint64 Frame = 0;
	uint32 ThreadId = 0;
};

/**
 * The readout, for as long as the process lives.
 *
 * On the engine rather than the game instance, which is the difference between
 * a tool and a toy: a game instance is created when play begins and destroyed
 * when it ends, so the server went down with it and took the page it was serving
 * with it -- the numbers vanished at exactly the moment you stopped to read
 * them. Here the endpoint is up from editor start, stays up across as many play
 * sessions as you run, and still exists in a cooked `-game` run, which is what
 * the perf harness drives.
 */
UCLASS()
class KBVEPERF_API UKBVEPerfSubsystem : public UEngineSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	void SubmitScope(FName Name, FName Category, double Ms);
	void SubmitCount(FName Name, double Value);

	bool IsCategoryEnabled(FName Category) const;

	FString BuildJson() const;

	/** Drop the scopes and counters, so a run can be measured on its own. */
	void ResetStats();

private:
	void ApplyEnabledState();
	void RebuildCategoryFilter();

	void StartHttp();
	void StopHttp();

	/**
	 * Start and stop listening to the engine's own stats.
	 *
	 * The numbers that answer "is any of this worth drawing" -- primitives
	 * processed, frustum culled, occluded, and the draw calls that survived --
	 * are counted by the renderer, not by us, and they exist only while the
	 * stats system is collecting. Nothing collects by default: a stat group is
	 * dormant until something turns it on, which is why reading the RHI's
	 * globals gave zeroes. This turns on the two groups that matter for as long
	 * as the readout is enabled, and turns them back off after.
	 */
	void StartStats();
	void StopStats();

	/** Called on the stats thread with a frame's worth of collected messages. */
	void OnStatsFrame(int64 Frame);

	bool Tick(float DeltaSeconds);

	mutable FCriticalSection Mutex;
	TMap<FName, FKBVEPerfOpStat> Ops;
	TMap<FName, double> Counts;
	TArray<FKBVEPerfEvent> Recent;

	/** Frame times and when each was taken, for the windowed frame figures. */
	TArray<float> FrameMs;
	TArray<double> FrameAt;
	int32 FrameHead = 0;
	int32 RecentHead = 0;

	TSet<FName> CategoryFilter;
	bool bAllCategories = true;

	float CachedFps = 0.0f;

	/** The RHI's own draw counters, published only when the platform fills them. */
	int32 CachedDrawCalls = 0;
	int32 CachedPrimitives = 0;

	/** Renderer counters, by the label they are published under. */
	TMap<FName, FName> Watched;
	TMap<FName, double> Scene;
	FDelegateHandle StatsHandle;
	int32 StatsEnableCount = 0;

	double CachedGameMs = 0.0;
	double CachedRenderMs = 0.0;
	double CachedGpuMs = 0.0;
	double CachedRhiMs = 0.0;

	FTSTicker::FDelegateHandle TickHandle;
	IConsoleVariable* MasterCVar = nullptr;

	TSharedPtr<IHttpRouter> Router;
	TSharedPtr<const FHttpRouteHandleInternal> RouteHandle;
	/**
	 * The readout page, which cannot be a route.
	 *
	 * `FHttpPath::IsValidPath` rejects root outright and `BindRoute` asserts on
	 * it, so there is no way to bind "/" -- and a preprocessor is the only hook
	 * that sees a request before the router decides it has nowhere to send it.
	 */
	FDelegateHandle PageHandle;
	int32 BoundPort = 0;
	bool bHttpActive = false;
};
