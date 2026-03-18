#include "UEDevOpsTelemetrySubsystem.h"
#include "UEDevOpsSettings.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonWriter.h"
#include "Misc/App.h"
#include "Misc/CoreDelegates.h"
#include "Misc/DateTime.h"
#include "Misc/Guid.h"
#include "Misc/OutputDeviceRedirector.h"
#include "HAL/PlatformTime.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY(LogUEDevOps);

// ─── Static severity/category strings (allocated once, never freed) ──────────
namespace UEDevOpsInternal
{
	static const FString SevFatal   = TEXT("fatal");
	static const FString SevError   = TEXT("error");
	static const FString SevWarning = TEXT("warning");
	static const FString SevInfo    = TEXT("info");

	static const FString CatError       = TEXT("error");
	static const FString CatPerformance = TEXT("performance");
	static const FString CatLog         = TEXT("log");
	static const FString CatCrash       = TEXT("crash");
	static const FString CatEnsure      = TEXT("ensure");
	static const FString CatHitch       = TEXT("hitch");

	static const FString MetaValue       = TEXT("value");
	static const FString MetaLogCategory = TEXT("logCategory");
	static const FString MetaFrameTimeMs = TEXT("frameTimeMs");
	static const FString MetaThresholdMs = TEXT("thresholdMs");
}

// ═════════════════════════════════════════════════════════════════════════════
// Initialize / Deinitialize
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings)
	{
		return;
	}

	// ── Session ID (generated once, included in every payload) ───────────
	CachedSessionId = FGuid::NewGuid().ToString(EGuidFormats::DigitsWithHyphens);

	// ── Pre-reserve queue ────────────────────────────────────────────────
	EventQueue.Reserve(Settings->MaxQueueSize);

	// ── Cache immutable strings ──────────────────────────────────────────
	CachedPlatformName   = FPlatformProperties::PlatformName();
	CachedBuildConfig    = LexToString(FApp::GetBuildConfiguration());
	CachedProjectVersion = FApp::GetBuildVersion();

	if (!Settings->TelemetryAuthToken.IsEmpty())
	{
		CachedAuthHeader = FString::Printf(TEXT("Bearer %s"), *Settings->TelemetryAuthToken);
	}

	// ── Pre-size serialization buffer ────────────────────────────────────
	SerializeBuffer.Reserve(Settings->MaxQueueSize * 256);

	// ── Rate limiter init ────────────────────────────────────────────────
	LogTokensRemaining = Settings->LogRateLimitPerSecond;
	LogTokenLastRefillTime = FPlatformTime::Seconds();

	// ── Auto-flush timer ─────────────────────────────────────────────────
	if (Settings->FlushIntervalSeconds > 0.0f)
	{
		if (UWorld* World = GetGameInstance()->GetWorld())
		{
			World->GetTimerManager().SetTimer(
				FlushTimerHandle,
				this,
				&UUEDevOpsTelemetrySubsystem::OnTimerFlush,
				Settings->FlushIntervalSeconds,
				true
			);
		}
	}

	// ── Feature hooks ────────────────────────────────────────────────────
	SetupLogCapture();
	SetupCrashHandlers();
	SetupHitchDetection();

	UE_LOG(LogUEDevOps, Log, TEXT("Initialized (session=%s, queue=%d, flush=%.1fs, logRate=%d/s, retries=%d, hitches=%s@%.0fms)"),
		*CachedSessionId,
		Settings->MaxQueueSize,
		Settings->FlushIntervalSeconds,
		Settings->LogRateLimitPerSecond,
		Settings->MaxRetryAttempts,
		Settings->bAutoDetectHitches ? TEXT("on") : TEXT("off"),
		Settings->HitchThresholdMs);
}

void UUEDevOpsTelemetrySubsystem::Deinitialize()
{
	TeardownHitchDetection();
	TeardownCrashHandlers();
	TeardownLogCapture();

	// Flush remaining events
	if (EventQueue.Num() > 0)
	{
		FlushEvents();
	}

	// Clear retry queue (best effort — we're shutting down)
	RetryQueue.Empty();

	if (RetryTimerHandle.IsValid())
	{
		if (UWorld* World = GetGameInstance()->GetWorld())
		{
			World->GetTimerManager().ClearTimer(RetryTimerHandle);
		}
	}

	if (FlushTimerHandle.IsValid())
	{
		if (UWorld* World = GetGameInstance()->GetWorld())
		{
			World->GetTimerManager().ClearTimer(FlushTimerHandle);
		}
	}

	Super::Deinitialize();
}

// ═════════════════════════════════════════════════════════════════════════════
// Event Recording
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::RecordEvent(const FDevOpsTelemetryEvent& InEvent)
{
	// Blueprint path: must copy
	FDevOpsTelemetryEvent Event = InEvent;
	EnqueueInternal(MoveTemp(Event));
}

void UUEDevOpsTelemetrySubsystem::RecordEvent(FDevOpsTelemetryEvent&& InEvent)
{
	// C++ fast path: move directly, zero copies
	EnqueueInternal(MoveTemp(InEvent));
}

FORCEINLINE void UUEDevOpsTelemetrySubsystem::EnqueueInternal(FDevOpsTelemetryEvent&& Event)
{
	Event.Timestamp = FDateTime::UtcNow().ToIso8601();
	EventQueue.Add(MoveTemp(Event));

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (Settings && EventQueue.Num() >= Settings->MaxQueueSize)
	{
		FlushEvents();
	}
}

void UUEDevOpsTelemetrySubsystem::ReportError(const FString& Message, const TMap<FString, FString>& Metadata)
{
	FDevOpsTelemetryEvent Event;
	Event.Category = UEDevOpsInternal::CatError;
	Event.Message = Message;
	Event.Severity = UEDevOpsInternal::SevError;
	Event.Metadata = Metadata;
	EnqueueInternal(MoveTemp(Event));
}

void UUEDevOpsTelemetrySubsystem::ReportPerformance(const FString& MetricName, float Value)
{
	FDevOpsTelemetryEvent Event;
	Event.Category = UEDevOpsInternal::CatPerformance;
	Event.Message = MetricName;
	Event.Severity = UEDevOpsInternal::SevInfo;
	Event.Metadata.Add(UEDevOpsInternal::MetaValue, FString::SanitizeFloat(Value));
	EnqueueInternal(MoveTemp(Event));
}

// ═════════════════════════════════════════════════════════════════════════════
// Flush & Serialize
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::FlushEvents()
{
	if (EventQueue.Num() == 0)
	{
		return;
	}

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || Settings->TelemetryEndpointURL.IsEmpty())
	{
		UE_LOG(LogUEDevOps, Warning, TEXT("TelemetryEndpointURL is not configured. Discarding %d events."), EventQueue.Num());
		EventQueue.Reset();
		return;
	}

	// Swap-and-flush: move queue out so new events can still enqueue during serialization
	TArray<FDevOpsTelemetryEvent> Batch;
	Swap(Batch, EventQueue);
	EventQueue.Reserve(Settings->MaxQueueSize);

	// Reuse the persistent buffer
	SerializeBuffer.Reset();
	SerializeEventsInto(Batch, SerializeBuffer);

	PostPayload(MoveTemp(SerializeBuffer));
}

void UUEDevOpsTelemetrySubsystem::SerializeEventsInto(
	const TArray<FDevOpsTelemetryEvent>& Events, FString& OutBuffer) const
{
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutBuffer);

	Writer->WriteObjectStart();
	Writer->WriteValue(TEXT("sessionId"), CachedSessionId);
	Writer->WriteArrayStart(TEXT("events"));

	for (const FDevOpsTelemetryEvent& Event : Events)
	{
		Writer->WriteObjectStart();
		Writer->WriteValue(TEXT("category"),       Event.Category);
		Writer->WriteValue(TEXT("message"),        Event.Message);
		Writer->WriteValue(TEXT("severity"),       Event.Severity);
		Writer->WriteValue(TEXT("timestamp"),      Event.Timestamp);
		Writer->WriteValue(TEXT("platform"),       CachedPlatformName);
		Writer->WriteValue(TEXT("buildConfig"),    CachedBuildConfig);
		Writer->WriteValue(TEXT("projectVersion"), CachedProjectVersion);

		Writer->WriteObjectStart(TEXT("metadata"));
		for (const auto& Pair : Event.Metadata)
		{
			Writer->WriteValue(Pair.Key, Pair.Value);
		}
		Writer->WriteObjectEnd();

		Writer->WriteObjectEnd();
	}

	Writer->WriteArrayEnd();
	Writer->WriteObjectEnd();
	Writer->Close();
}

int32 UUEDevOpsTelemetrySubsystem::GetQueuedEventCount() const
{
	return EventQueue.Num();
}

void UUEDevOpsTelemetrySubsystem::OnTimerFlush()
{
	FlushEvents();
}

// ═════════════════════════════════════════════════════════════════════════════
// HTTP POST with Retry
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::PostPayload(FString&& JsonPayload)
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings)
	{
		return;
	}

	// Capture payload for potential retry (copy before move)
	const int32 MaxRetries = Settings->MaxRetryAttempts;
	FString PayloadCopy;
	if (MaxRetries > 0)
	{
		PayloadCopy = JsonPayload;
	}

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Settings->TelemetryEndpointURL);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	if (!CachedAuthHeader.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), CachedAuthHeader);
	}

	Request->SetContentAsString(MoveTemp(JsonPayload));

	// Weak pointer to avoid preventing GC of the subsystem
	TWeakObjectPtr<UUEDevOpsTelemetrySubsystem> WeakThis(this);

	Request->OnProcessRequestComplete().BindLambda(
		[WeakThis, PayloadForRetry = MoveTemp(PayloadCopy), MaxRetries]
		(FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess) mutable
		{
			const bool bOk = bSuccess && Resp.IsValid() && EHttpResponseCodes::IsOk(Resp->GetResponseCode());
			if (!bOk)
			{
				const int32 Code = Resp.IsValid() ? Resp->GetResponseCode() : 0;
				UE_LOG(LogUEDevOps, Warning, TEXT("Telemetry POST failed (code %d)"), Code);

				// Enqueue for retry if retries are enabled
				if (MaxRetries > 0 && WeakThis.IsValid() && !PayloadForRetry.IsEmpty())
				{
					FRetryEntry Entry;
					Entry.Payload = MoveTemp(PayloadForRetry);
					Entry.Attempt = 1;
					WeakThis->RetryQueue.Add(MoveTemp(Entry));
					WeakThis->ScheduleRetry();
				}
			}
		});

	Request->ProcessRequest();
}

void UUEDevOpsTelemetrySubsystem::ScheduleRetry()
{
	// Don't schedule if a timer is already pending
	if (RetryTimerHandle.IsValid())
	{
		return;
	}

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || RetryQueue.Num() == 0)
	{
		return;
	}

	// Exponential backoff: base * 2^(attempt-1)
	const float Delay = Settings->RetryBaseDelaySeconds * FMath::Pow(2.0f, static_cast<float>(RetryQueue[0].Attempt - 1));

	if (UWorld* World = GetGameInstance()->GetWorld())
	{
		World->GetTimerManager().SetTimer(
			RetryTimerHandle,
			this,
			&UUEDevOpsTelemetrySubsystem::ProcessRetryQueue,
			Delay,
			false
		);
	}
}

void UUEDevOpsTelemetrySubsystem::ProcessRetryQueue()
{
	RetryTimerHandle.Invalidate();

	if (RetryQueue.Num() == 0)
	{
		return;
	}

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings)
	{
		RetryQueue.Empty();
		return;
	}

	// Take the oldest entry
	FRetryEntry Entry = MoveTemp(RetryQueue[0]);
	RetryQueue.RemoveAt(0, EAllowShrinking::No);

	const int32 MaxRetries = Settings->MaxRetryAttempts;
	const int32 CurrentAttempt = Entry.Attempt;

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Settings->TelemetryEndpointURL);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	if (!CachedAuthHeader.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), CachedAuthHeader);
	}

	Request->SetContentAsString(Entry.Payload);

	TWeakObjectPtr<UUEDevOpsTelemetrySubsystem> WeakThis(this);

	Request->OnProcessRequestComplete().BindLambda(
		[WeakThis, PayloadForRetry = MoveTemp(Entry.Payload), CurrentAttempt, MaxRetries]
		(FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess) mutable
		{
			const bool bOk = bSuccess && Resp.IsValid() && EHttpResponseCodes::IsOk(Resp->GetResponseCode());
			if (!bOk && WeakThis.IsValid())
			{
				const int32 Code = Resp.IsValid() ? Resp->GetResponseCode() : 0;

				if (CurrentAttempt < MaxRetries)
				{
					UE_LOG(LogUEDevOps, Warning, TEXT("Retry %d/%d failed (code %d), scheduling next attempt"),
						CurrentAttempt, MaxRetries, Code);

					FRetryEntry NewEntry;
					NewEntry.Payload = MoveTemp(PayloadForRetry);
					NewEntry.Attempt = CurrentAttempt + 1;
					WeakThis->RetryQueue.Add(MoveTemp(NewEntry));
					WeakThis->ScheduleRetry();
				}
				else
				{
					UE_LOG(LogUEDevOps, Error, TEXT("Telemetry POST failed after %d retries (code %d). Data lost."),
						MaxRetries, Code);
				}
			}
			else if (bOk)
			{
				UE_LOG(LogUEDevOps, Log, TEXT("Retry %d/%d succeeded"), CurrentAttempt, MaxRetries);
			}

			// If there are more entries in the queue, keep processing
			if (WeakThis.IsValid() && WeakThis->RetryQueue.Num() > 0)
			{
				WeakThis->ScheduleRetry();
			}
		});

	Request->ProcessRequest();
}

// ═════════════════════════════════════════════════════════════════════════════
// Rate Limiter (Token Bucket)
// ═════════════════════════════════════════════════════════════════════════════

bool UUEDevOpsTelemetrySubsystem::ConsumeLogToken()
{
	const double Now = FPlatformTime::Seconds();
	const double Elapsed = Now - LogTokenLastRefillTime;

	if (Elapsed >= 1.0)
	{
		// Refill bucket
		const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
		LogTokensRemaining = Settings ? Settings->LogRateLimitPerSecond : 10;
		LogTokenLastRefillTime = Now;
	}

	if (LogTokensRemaining > 0)
	{
		--LogTokensRemaining;
		return true;
	}

	return false;
}

// ═════════════════════════════════════════════════════════════════════════════
// Log Capture
// ═════════════════════════════════════════════════════════════════════════════

/** FOutputDevice that forwards log messages to the telemetry subsystem. */
class FDevOpsLogCapture : public FOutputDevice
{
public:
	UUEDevOpsTelemetrySubsystem* Owner = nullptr;
	ELogVerbosity::Type MinVerbosity = ELogVerbosity::Warning;

	virtual void Serialize(const TCHAR* Message, ELogVerbosity::Type Verbosity, const FName& Category) override
	{
		if (!Owner || Verbosity > MinVerbosity)
		{
			return;
		}

		// Ignore our own log category to prevent feedback loops
		static const FName OurCategory(TEXT("LogUEDevOps"));
		if (Category == OurCategory)
		{
			return;
		}

		// Rate limit: drop events if bucket is empty
		if (!Owner->ConsumeLogToken())
		{
			return;
		}

		FDevOpsTelemetryEvent Event;
		Event.Category = UEDevOpsInternal::CatLog;
		Event.Message = Message;

		switch (Verbosity)
		{
		case ELogVerbosity::Fatal:   Event.Severity = UEDevOpsInternal::SevFatal;   break;
		case ELogVerbosity::Error:   Event.Severity = UEDevOpsInternal::SevError;   break;
		case ELogVerbosity::Warning: Event.Severity = UEDevOpsInternal::SevWarning; break;
		default:                     Event.Severity = UEDevOpsInternal::SevInfo;    break;
		}

		Event.Metadata.Add(UEDevOpsInternal::MetaLogCategory, Category.ToString());

		Owner->RecordEvent(MoveTemp(Event));
	}
};

void UUEDevOpsTelemetrySubsystem::SetupLogCapture()
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || !Settings->bAutoCaptureLogs)
	{
		return;
	}

	LogCaptureDevice = new FDevOpsLogCapture();
	LogCaptureDevice->Owner = this;
	LogCaptureDevice->MinVerbosity = UUEDevOpsSettings::ToEngineVerbosity(Settings->MinLogVerbosity);
	GLog->AddOutputDevice(LogCaptureDevice);
}

void UUEDevOpsTelemetrySubsystem::TeardownLogCapture()
{
	if (LogCaptureDevice)
	{
		GLog->RemoveOutputDevice(LogCaptureDevice);
		delete LogCaptureDevice;
		LogCaptureDevice = nullptr;
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// Crash / Ensure Hooks
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::SetupCrashHandlers()
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || !Settings->bCaptureCrashesAndEnsures)
	{
		return;
	}

	CrashDelegateHandle = FCoreDelegates::OnHandleSystemError.AddUObject(
		this, &UUEDevOpsTelemetrySubsystem::OnSystemError);

	EnsureDelegateHandle = FCoreDelegates::OnHandleSystemEnsure.AddUObject(
		this, &UUEDevOpsTelemetrySubsystem::OnSystemEnsure);
}

void UUEDevOpsTelemetrySubsystem::TeardownCrashHandlers()
{
	if (CrashDelegateHandle.IsValid())
	{
		FCoreDelegates::OnHandleSystemError.Remove(CrashDelegateHandle);
		CrashDelegateHandle.Reset();
	}

	if (EnsureDelegateHandle.IsValid())
	{
		FCoreDelegates::OnHandleSystemEnsure.Remove(EnsureDelegateHandle);
		EnsureDelegateHandle.Reset();
	}
}

void UUEDevOpsTelemetrySubsystem::OnSystemError()
{
	// CRASH HANDLER — keep allocations minimal, engine is in an unstable state.
	FDevOpsTelemetryEvent Event;
	Event.Category = UEDevOpsInternal::CatCrash;
	Event.Message = TEXT("Fatal system error detected");
	Event.Severity = UEDevOpsInternal::SevFatal;
	Event.Timestamp = FDateTime::UtcNow().ToIso8601();

	EventQueue.Add(MoveTemp(Event));

	// Best-effort flush — fire and forget, the process may be killed any moment
	FlushEvents();
}

void UUEDevOpsTelemetrySubsystem::OnSystemEnsure()
{
	// Ensure (soft assert) — engine continues running, safe to allocate normally
	FDevOpsTelemetryEvent Event;
	Event.Category = UEDevOpsInternal::CatEnsure;
	Event.Message = TEXT("Ensure condition failed");
	Event.Severity = UEDevOpsInternal::SevError;

	EnqueueInternal(MoveTemp(Event));
}

// ═════════════════════════════════════════════════════════════════════════════
// Hitch Detection
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::SetupHitchDetection()
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || !Settings->bAutoDetectHitches)
	{
		return;
	}

	HitchThresholdSeconds = Settings->HitchThresholdMs / 1000.0f;
	LastFrameStartSeconds = FPlatformTime::Seconds();

	FrameBeginDelegateHandle = FCoreDelegates::OnBeginFrame.AddUObject(
		this, &UUEDevOpsTelemetrySubsystem::OnFrameBegin);

	bHitchDetectionActive = true;
}

void UUEDevOpsTelemetrySubsystem::TeardownHitchDetection()
{
	if (bHitchDetectionActive)
	{
		FCoreDelegates::OnBeginFrame.Remove(FrameBeginDelegateHandle);
		FrameBeginDelegateHandle.Reset();
		bHitchDetectionActive = false;
	}
}

void UUEDevOpsTelemetrySubsystem::OnFrameBegin()
{
	const double Now = FPlatformTime::Seconds();
	const float FrameDelta = static_cast<float>(Now - LastFrameStartSeconds);

	if (FrameDelta > HitchThresholdSeconds && LastFrameStartSeconds > 0.0)
	{
		const float FrameMs = FrameDelta * 1000.0f;

		FDevOpsTelemetryEvent Event;
		Event.Category = UEDevOpsInternal::CatHitch;
		Event.Message = FString::Printf(TEXT("Frame hitch: %.1fms"), FrameMs);
		Event.Severity = (FrameMs > HitchThresholdSeconds * 1000.0f * 4.0f)
			? UEDevOpsInternal::SevError
			: UEDevOpsInternal::SevWarning;
		Event.Metadata.Add(UEDevOpsInternal::MetaFrameTimeMs, FString::SanitizeFloat(FrameMs));
		Event.Metadata.Add(UEDevOpsInternal::MetaThresholdMs,
			FString::SanitizeFloat(HitchThresholdSeconds * 1000.0f));

		EnqueueInternal(MoveTemp(Event));
	}

	LastFrameStartSeconds = Now;
}
