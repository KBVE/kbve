#pragma once

#include "CoreMinimal.h"
#include "HAL/CriticalSection.h"
#include "Subsystems/GameInstanceSubsystem.h"
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
	int32 SampleHead = 0;
};

struct FKBVEPerfEvent
{
	FName Name;
	double Ms = 0.0;
	uint64 Frame = 0;
	uint32 ThreadId = 0;
};

UCLASS()
class KBVEPERF_API UKBVEPerfSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	void SubmitScope(FName Name, FName Category, double Ms);
	void SubmitCount(FName Name, double Value);

	bool IsCategoryEnabled(FName Category) const;

	FString BuildJson() const;

private:
	void ApplyEnabledState();
	void RebuildCategoryFilter();

	void StartHttp();
	void StopHttp();

	bool Tick(float DeltaSeconds);

	mutable FCriticalSection Mutex;
	TMap<FName, FKBVEPerfOpStat> Ops;
	TMap<FName, double> Counts;
	TArray<FKBVEPerfEvent> Recent;
	int32 RecentHead = 0;

	TSet<FName> CategoryFilter;
	bool bAllCategories = true;

	float CachedFps = 0.0f;

	FTSTicker::FDelegateHandle TickHandle;
	IConsoleVariable* MasterCVar = nullptr;

	TSharedPtr<IHttpRouter> Router;
	TSharedPtr<const FHttpRouteHandleInternal> RouteHandle;
	int32 BoundPort = 0;
	bool bHttpActive = false;
};
