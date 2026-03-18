#include "UEDevOpsTelemetrySubsystem.h"
#include "UEDevOpsSettings.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonWriter.h"
#include "Misc/App.h"
#include "Misc/DateTime.h"
#include "Misc/OutputDeviceRedirector.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY(LogUEDevOps);

// ─── Static severity strings (allocated once, never freed) ───────────────────
namespace UEDevOpsInternal
{
	static const FString SevFatal   = TEXT("fatal");
	static const FString SevError   = TEXT("error");
	static const FString SevWarning = TEXT("warning");
	static const FString SevInfo    = TEXT("info");

	static const FString CatError       = TEXT("error");
	static const FString CatPerformance = TEXT("performance");
	static const FString CatLog         = TEXT("log");

	static const FString MetaValue       = TEXT("value");
	static const FString MetaLogCategory = TEXT("logCategory");
}

// ─── Initialize / Deinitialize ───────────────────────────────────────────────

void UUEDevOpsTelemetrySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings)
	{
		return;
	}

	// Pre-reserve queue to configured max — eliminates reallocs during gameplay
	EventQueue.Reserve(Settings->MaxQueueSize);

	// Cache immutable strings once — zero per-flush string construction
	CachedPlatformName   = FPlatformProperties::PlatformName();
	CachedBuildConfig    = LexToString(FApp::GetBuildConfiguration());
	CachedProjectVersion = FApp::GetBuildVersion();

	if (!Settings->TelemetryAuthToken.IsEmpty())
	{
		CachedAuthHeader = FString::Printf(TEXT("Bearer %s"), *Settings->TelemetryAuthToken);
	}

	// Pre-size the serialization buffer (rough estimate: ~256 bytes per event)
	SerializeBuffer.Reserve(Settings->MaxQueueSize * 256);

	// Auto-flush timer
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

	SetupLogCapture();
}

void UUEDevOpsTelemetrySubsystem::Deinitialize()
{
	TeardownLogCapture();

	// Flush remaining events
	if (EventQueue.Num() > 0)
	{
		FlushEvents();
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

// ─── Event Recording ─────────────────────────────────────────────────────────

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

// ─── Flush & Serialize ───────────────────────────────────────────────────────

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
		EventQueue.Reset(); // Reset keeps allocated capacity, Empty frees it
		return;
	}

	// Swap-and-flush: move queue out so new events can still enqueue during serialization
	TArray<FDevOpsTelemetryEvent> Batch;
	Swap(Batch, EventQueue);
	// Re-reserve the now-empty queue for the next batch
	EventQueue.Reserve(Settings->MaxQueueSize);

	// Reuse the persistent buffer — Reset() preserves capacity
	SerializeBuffer.Reset();
	SerializeEventsInto(Batch, SerializeBuffer);

	// Move the buffer contents into the POST — avoids copying the payload string
	PostPayload(MoveTemp(SerializeBuffer));
}

void UUEDevOpsTelemetrySubsystem::SerializeEventsInto(
	const TArray<FDevOpsTelemetryEvent>& Events, FString& OutBuffer) const
{
	// Direct TJsonWriter serialization — no FJsonObject intermediary tree.
	// This eliminates N × MakeShared<FJsonObject> + N × MakeShared<FJsonValueObject>
	// allocations that the old approach created per flush.
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&OutBuffer);

	Writer->WriteObjectStart();
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

// ─── HTTP POST ───────────────────────────────────────────────────────────────

void UUEDevOpsTelemetrySubsystem::PostPayload(FString&& JsonPayload)
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Settings->TelemetryEndpointURL);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	// Use cached auth header — no per-POST Printf
	if (!CachedAuthHeader.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), CachedAuthHeader);
	}

	Request->SetContentAsString(MoveTemp(JsonPayload));

	Request->OnProcessRequestComplete().BindLambda(
		[](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
		{
			if (!bSuccess || !Resp.IsValid() || !EHttpResponseCodes::IsOk(Resp->GetResponseCode()))
			{
				UE_LOG(LogUEDevOps, Warning, TEXT("Telemetry POST failed (code %d)"),
					Resp.IsValid() ? Resp->GetResponseCode() : 0);
			}
		});

	Request->ProcessRequest();
}

// ─── Log Capture ─────────────────────────────────────────────────────────────

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

		// Build event using cached static strings — zero FString construction for category/severity
		FDevOpsTelemetryEvent Event;
		Event.Category = UEDevOpsInternal::CatLog;
		Event.Message = Message; // Single FString construction (unavoidable — TCHAR* to FString)

		switch (Verbosity)
		{
		case ELogVerbosity::Fatal:   Event.Severity = UEDevOpsInternal::SevFatal;   break;
		case ELogVerbosity::Error:   Event.Severity = UEDevOpsInternal::SevError;   break;
		case ELogVerbosity::Warning: Event.Severity = UEDevOpsInternal::SevWarning; break;
		default:                     Event.Severity = UEDevOpsInternal::SevInfo;    break;
		}

		Event.Metadata.Add(UEDevOpsInternal::MetaLogCategory, Category.ToString());

		// Move into queue — no copy of the event
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
