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

	/** Base URL for the telemetry/error reporting endpoint (e.g. https://ingest.example.com) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry")
	FString TelemetryEndpointURL;

	/** Optional bearer token sent with every telemetry POST */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry")
	FString TelemetryAuthToken;

	/** Enable automatic capture of Unreal log errors/warnings */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry")
	bool bAutoCaptureLogs = true;

	/** Minimum log verbosity to capture (Warning, Error, Fatal) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry",
		meta = (EditCondition = "bAutoCaptureLogs"))
	EDevOpsLogVerbosity MinLogVerbosity = EDevOpsLogVerbosity::Warning;

	/** Maximum queued events before a flush is forced */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry",
		meta = (ClampMin = "1", ClampMax = "1000"))
	int32 MaxQueueSize = 50;

	/** Seconds between automatic telemetry flushes (0 = manual only) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "Telemetry",
		meta = (ClampMin = "0.0", ClampMax = "300.0"))
	float FlushIntervalSeconds = 30.0f;

	/** GitHub Personal Access Token for editor integrations (issues, releases) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "GitHub")
	FString GitHubToken;

	/** GitHub repository in owner/repo format (e.g. KBVE/kbve) */
	UPROPERTY(config, EditAnywhere, BlueprintReadOnly, Category = "GitHub")
	FString GitHubRepository;

	/** Get the singleton settings object */
	static const UUEDevOpsSettings* Get();
};
