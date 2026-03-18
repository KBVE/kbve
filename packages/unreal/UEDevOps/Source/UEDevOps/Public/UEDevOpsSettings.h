#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "UEDevOpsSettings.generated.h"

/** UHT-compatible log verbosity for settings UI. */
UENUM(BlueprintType)
enum class EDevOpsLogVerbosity : uint8
{
	Fatal    UMETA(DisplayName = "Fatal"),
	Error    UMETA(DisplayName = "Error"),
	Warning  UMETA(DisplayName = "Warning"),
	Display  UMETA(DisplayName = "Display"),
	Log      UMETA(DisplayName = "Log"),
};

/**
 * Project-wide DevOps configuration.
 * Edit in Project Settings > Plugins > UEDevOps.
 */
UCLASS(config = Game, defaultconfig, meta = (DisplayName = "UEDevOps"))
class UEDEVOPS_API UUEDevOpsSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UUEDevOpsSettings();

	/** Convert EDevOpsLogVerbosity to engine ELogVerbosity::Type. */
	static ELogVerbosity::Type ToEngineVerbosity(EDevOpsLogVerbosity V);

	// ─── Telemetry Endpoint ──────────────────────────────────────────────

	/** Base URL for the telemetry/error reporting endpoint (e.g. https://ingest.example.com) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry")
	FString TelemetryEndpointURL;

	/** Optional bearer token sent with every telemetry POST */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry")
	FString TelemetryAuthToken;

	// ─── Queue & Flush ───────────────────────────────────────────────────

	/** Maximum queued events before a flush is forced */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry",
		meta = (ClampMin = "1", ClampMax = "1000"))
	int32 MaxQueueSize = 50;

	/** Seconds between automatic telemetry flushes (0 = manual only) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry",
		meta = (ClampMin = "0.0", ClampMax = "300.0"))
	float FlushIntervalSeconds = 30.0f;

	// ─── Log Capture ─────────────────────────────────────────────────────

	/** Enable automatic capture of Unreal log errors/warnings */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Log Capture")
	bool bAutoCaptureLogs = true;

	/** Minimum log verbosity to capture (Warning, Error, Fatal) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Log Capture",
		meta = (EditCondition = "bAutoCaptureLogs"))
	EDevOpsLogVerbosity MinLogVerbosity = EDevOpsLogVerbosity::Warning;

	/** Max log events captured per second (token bucket). Prevents error-spam floods. */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Log Capture",
		meta = (EditCondition = "bAutoCaptureLogs", ClampMin = "1", ClampMax = "1000"))
	int32 LogRateLimitPerSecond = 10;

	// ─── Retry ───────────────────────────────────────────────────────────

	/** Max retry attempts for failed telemetry POSTs (0 = no retry, data is lost) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Retry",
		meta = (ClampMin = "0", ClampMax = "10"))
	int32 MaxRetryAttempts = 3;

	/** Base delay in seconds for exponential backoff (delay = base * 2^attempt) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Retry",
		meta = (ClampMin = "0.5", ClampMax = "60.0"))
	float RetryBaseDelaySeconds = 2.0f;

	// ─── Crash & Ensure ──────────────────────────────────────────────────

	/** Hook into FCoreDelegates to capture crashes and ensures as telemetry events */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Crash Handling")
	bool bCaptureCrashesAndEnsures = true;

	// ─── Hitch Detection ─────────────────────────────────────────────────

	/** Automatically detect and report frame hitches */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Hitch Detection")
	bool bAutoDetectHitches = true;

	/** Frame time threshold in milliseconds to qualify as a hitch */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Hitch Detection",
		meta = (EditCondition = "bAutoDetectHitches", ClampMin = "16.0", ClampMax = "1000.0"))
	float HitchThresholdMs = 50.0f;

	// ─── GitHub (Editor Only) ────────────────────────────────────────────

	/** GitHub Personal Access Token for editor integrations (issues, releases) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "GitHub")
	FString GitHubToken;

	/** GitHub repository in owner/repo format (e.g. KBVE/kbve) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "GitHub")
	FString GitHubRepository;

	/** Get the singleton settings object */
	static const UUEDevOpsSettings* Get();
};
