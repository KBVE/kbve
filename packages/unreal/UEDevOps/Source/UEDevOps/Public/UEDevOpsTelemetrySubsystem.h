#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Engine/TimerHandle.h"
#include "UEDevOpsTelemetrySubsystem.generated.h"

DECLARE_LOG_CATEGORY_EXTERN(LogUEDevOps, Log, All);

USTRUCT(BlueprintType)
struct UEDEVOPS_API FDevOpsTelemetryEvent
{
	GENERATED_BODY()

	/** Event category (e.g. "error", "performance", "gameplay") */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Telemetry")
	FString Category;

	/** Short summary of the event */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Telemetry")
	FString Message;

	/** Severity: info, warning, error, fatal */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Telemetry")
	FString Severity = TEXT("info");

	/** Arbitrary key-value metadata */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Telemetry")
	TMap<FString, FString> Metadata;

	/** Auto-populated UTC timestamp (ISO 8601) */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Telemetry")
	FString Timestamp;
};

/**
 * Game-instance subsystem that queues telemetry events and POSTs them
 * to a configurable HTTP endpoint. Usable from Blueprints and C++.
 *
 * Features:
 * - Zero-alloc hot path (pre-reserved queue, cached strings, direct serialization)
 * - Session ID for backend event correlation
 * - Token-bucket rate limiter on log capture (prevents error-spam floods)
 * - Exponential-backoff retry on failed POSTs
 * - FCoreDelegates crash/ensure hooks
 * - Automatic frame hitch detection
 */
UCLASS()
class UEDEVOPS_API UUEDevOpsTelemetrySubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Queue a telemetry event. Flushed automatically or via FlushEvents(). */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry")
	void RecordEvent(const FDevOpsTelemetryEvent& Event);

	/** C++ fast path: move an event into the queue without copying. */
	void RecordEvent(FDevOpsTelemetryEvent&& Event);

	/** Convenience: record a player error with a message and optional metadata. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry")
	void ReportError(const FString& Message, const TMap<FString, FString>& Metadata);

	/** Convenience: record a performance sample (e.g. FPS, hitch). */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry")
	void ReportPerformance(const FString& MetricName, float Value);

	/** Immediately POST all queued events to the configured endpoint. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry")
	void FlushEvents();

	/** Returns the number of events currently queued. */
	UFUNCTION(BlueprintPure, Category = "UEDevOps|Telemetry")
	int32 GetQueuedEventCount() const;

	/** Returns the unique session ID generated at subsystem init. */
	UFUNCTION(BlueprintPure, Category = "UEDevOps|Telemetry")
	const FString& GetSessionId() const { return CachedSessionId; }

private:
	void OnTimerFlush();
	void PostPayload(FString&& JsonPayload);
	void SerializeEventsInto(const TArray<FDevOpsTelemetryEvent>& Events, FString& OutBuffer) const;
	void SetupLogCapture();
	void TeardownLogCapture();
	void EnqueueInternal(FDevOpsTelemetryEvent&& Event);

	// ─── Rate Limiter ────────────────────────────────────────────────────
	/** Returns true if a log event is allowed through the token bucket. */
	bool ConsumeLogToken();
	int32 LogTokensRemaining = 0;
	double LogTokenLastRefillTime = 0.0;

	// ─── Retry ───────────────────────────────────────────────────────────
	struct FRetryEntry
	{
		FString Payload;
		int32 Attempt;
	};
	TArray<FRetryEntry> RetryQueue;
	FTimerHandle RetryTimerHandle;
	void ProcessRetryQueue();
	void ScheduleRetry();

	// ─── Crash / Ensure ──────────────────────────────────────────────────
	void SetupCrashHandlers();
	void TeardownCrashHandlers();
	void OnSystemError();
	void OnSystemEnsure();
	FDelegateHandle CrashDelegateHandle;
	FDelegateHandle EnsureDelegateHandle;

	// ─── Hitch Detection ─────────────────────────────────────────────────
	void SetupHitchDetection();
	void TeardownHitchDetection();
	void OnFrameBegin();
	double LastFrameStartSeconds = 0.0;
	float HitchThresholdSeconds = 0.05f;
	FDelegateHandle FrameBeginDelegateHandle;
	bool bHitchDetectionActive = false;

	// ─── Event Queue ─────────────────────────────────────────────────────
	TArray<FDevOpsTelemetryEvent> EventQueue;
	FTimerHandle FlushTimerHandle;

	/** Reusable serialization buffer — Reset() instead of reallocating each flush. */
	FString SerializeBuffer;

	// ─── Cached Immutable Strings ────────────────────────────────────────
	FString CachedSessionId;
	FString CachedPlatformName;
	FString CachedBuildConfig;
	FString CachedProjectVersion;
	FString CachedAuthHeader;

	/** Custom output device registered with GLog to intercept log messages. */
	friend class FDevOpsLogCapture;
	class FDevOpsLogCapture* LogCaptureDevice = nullptr;
};
