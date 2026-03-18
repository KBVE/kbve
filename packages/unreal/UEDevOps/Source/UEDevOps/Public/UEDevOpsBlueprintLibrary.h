#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "UEDevOpsTelemetrySubsystem.h"
#include "UEDevOpsBlueprintLibrary.generated.h"

/**
 * Blueprint-callable static helpers for DevOps telemetry and diagnostics.
 * These are available anywhere in Blueprints without needing a subsystem reference.
 */
UCLASS()
class UEDEVOPS_API UUEDevOpsBlueprintLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/** Send an error report with a message and optional key-value metadata. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry",
		meta = (WorldContext = "WorldContextObject"))
	static void ReportError(const UObject* WorldContextObject,
		const FString& Message,
		const TMap<FString, FString>& Metadata);

	/** Send a custom telemetry event. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry",
		meta = (WorldContext = "WorldContextObject"))
	static void SendTelemetryEvent(const UObject* WorldContextObject,
		const FString& Category,
		const FString& Message,
		const FString& Severity,
		const TMap<FString, FString>& Metadata);

	/** Report a performance metric (e.g. "AverageFrameTime", 16.6). */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry",
		meta = (WorldContext = "WorldContextObject"))
	static void ReportPerformanceMetric(const UObject* WorldContextObject,
		const FString& MetricName, float Value);

	/** Force-flush all queued telemetry events immediately. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|Telemetry",
		meta = (WorldContext = "WorldContextObject"))
	static void FlushTelemetry(const UObject* WorldContextObject);

	/** Get the number of events waiting to be sent. */
	UFUNCTION(BlueprintPure, Category = "UEDevOps|Telemetry",
		meta = (WorldContext = "WorldContextObject"))
	static int32 GetPendingEventCount(const UObject* WorldContextObject);

	/** Returns basic device info (platform, GPU, RAM) as a string map. */
	UFUNCTION(BlueprintPure, Category = "UEDevOps|Diagnostics")
	static TMap<FString, FString> GetDeviceInfo();
};
