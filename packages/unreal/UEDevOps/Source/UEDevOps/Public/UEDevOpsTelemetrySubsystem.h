#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "UEDevOpsTelemetrySubsystem.generated.h"

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

private:
	void OnTimerFlush();
	void PostPayload(const FString& JsonPayload);
	FString SerializeQueue() const;
	void SetupLogCapture();
	void TeardownLogCapture();

	TArray<FDevOpsTelemetryEvent> EventQueue;
	FTimerHandle FlushTimerHandle;
	FDelegateHandle LogOutputHandle;
};
