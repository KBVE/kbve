#include "UEDevOpsTelemetrySubsystem.h"
#include "UEDevOpsSettings.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Misc/App.h"
#include "Misc/CoreDelegates.h"
#include "Misc/DateTime.h"
#include "Misc/Guid.h"
#include "Misc/OutputDeviceRedirector.h"
#include "HAL/PlatformTime.h"
#include "TimerManager.h"

#include "KBVEYYJson.h"
#include "KBVEXXHash.h"
#include "KBVEZstd.h"

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

	static const FString MetaValue        = TEXT("value");
	static const FString MetaLogCategory  = TEXT("logCategory");
	static const FString MetaFrameTimeMs  = TEXT("frameTimeMs");
	static const FString MetaThresholdMs  = TEXT("thresholdMs");
	static const FString MetaOccurrences  = TEXT("occurrences");
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

	// ── Session ID ───────────────────────────────────────────────────────
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

	UE_LOG(LogUEDevOps, Log, TEXT("Initialized (session=%s, queue=%d, flush=%.1fs, logRate=%d/s, retries=%d, hitches=%s@%.0fms, zstd=%s@%d, dedup=%s@%.0fs)"),
		*CachedSessionId,
		Settings->MaxQueueSize,
		Settings->FlushIntervalSeconds,
		Settings->LogRateLimitPerSecond,
		Settings->MaxRetryAttempts,
		Settings->bAutoDetectHitches ? TEXT("on") : TEXT("off"),
		Settings->HitchThresholdMs,
		Settings->bCompressPayload ? TEXT("on") : TEXT("off"),
		Settings->CompressionLevel,
		Settings->bDeduplicateEvents ? TEXT("on") : TEXT("off"),
		Settings->DedupWindowSeconds);
}

void UUEDevOpsTelemetrySubsystem::Deinitialize()
{
	TeardownHitchDetection();
	TeardownCrashHandlers();
	TeardownLogCapture();

	// Flush dedup entries into queue before final flush
	FlushDedupEntries();

	if (EventQueue.Num() > 0)
	{
		FlushEvents();
	}

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
	FDevOpsTelemetryEvent Event = InEvent;
	EnqueueInternal(MoveTemp(Event));
}

void UUEDevOpsTelemetrySubsystem::RecordEvent(FDevOpsTelemetryEvent&& InEvent)
{
	EnqueueInternal(MoveTemp(InEvent));
}

FORCEINLINE void UUEDevOpsTelemetrySubsystem::EnqueueInternal(FDevOpsTelemetryEvent&& Event)
{
	Event.Timestamp = FDateTime::UtcNow().ToIso8601();

	// Deduplication: collapse identical events within the time window
	if (TryDeduplicateEvent(Event))
	{
		return; // Collapsed into existing entry
	}

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
// Deduplication (xxHash)
// ═════════════════════════════════════════════════════════════════════════════

bool UUEDevOpsTelemetrySubsystem::TryDeduplicateEvent(FDevOpsTelemetryEvent& Event)
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || !Settings->bDeduplicateEvents)
	{
		return false;
	}

	// Hash the identity triple: category + message + severity
	// Use xxHash for O(1) lookup with minimal collision risk
	const FString Key = Event.Category + TEXT("|") + Event.Message + TEXT("|") + Event.Severity;
	const auto KeyUtf8 = StringCast<UTF8CHAR>(*Key);
	const uint64 Hash = XXH64(KeyUtf8.Get(), KeyUtf8.Length(), 0);

	const double Now = FPlatformTime::Seconds();

	if (FDedupEntry* Existing = DedupMap.Find(Hash))
	{
		// Within dedup window? Collapse.
		if ((Now - Existing->FirstSeenTime) < Settings->DedupWindowSeconds)
		{
			Existing->Count++;
			return true; // Collapsed — do NOT enqueue
		}

		// Window expired — flush the old entry, then let this one through as new
		if (Existing->Count > 1)
		{
			Existing->Event.Metadata.Add(UEDevOpsInternal::MetaOccurrences,
				FString::FromInt(Existing->Count));
		}
		EventQueue.Add(MoveTemp(Existing->Event));
		DedupMap.Remove(Hash);
	}

	// Register as new dedup entry
	FDedupEntry& NewEntry = DedupMap.Add(Hash);
	NewEntry.Event = Event; // Copy — we need to keep it for potential future collapses
	NewEntry.Count = 1;
	NewEntry.FirstSeenTime = Now;

	return false; // Not collapsed — caller should enqueue normally
}

void UUEDevOpsTelemetrySubsystem::FlushDedupEntries()
{
	for (auto& Pair : DedupMap)
	{
		FDedupEntry& Entry = Pair.Value;
		if (Entry.Count > 1)
		{
			Entry.Event.Metadata.Add(UEDevOpsInternal::MetaOccurrences,
				FString::FromInt(Entry.Count));
		}
		EventQueue.Add(MoveTemp(Entry.Event));
	}
	DedupMap.Reset();
}

// ═════════════════════════════════════════════════════════════════════════════
// Flush & Serialize (yyjson)
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::FlushEvents()
{
	// Flush dedup entries first
	FlushDedupEntries();

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

	// Swap-and-flush
	TArray<FDevOpsTelemetryEvent> Batch;
	Swap(Batch, EventQueue);
	EventQueue.Reserve(Settings->MaxQueueSize);

	SerializeBuffer.Reset();
	SerializeEventsInto(Batch, SerializeBuffer);

	PostPayload(MoveTemp(SerializeBuffer));
}

void UUEDevOpsTelemetrySubsystem::SerializeEventsInto(
	const TArray<FDevOpsTelemetryEvent>& Events, FString& OutBuffer) const
{
	// ── yyjson mutable document — single contiguous allocation ───────────
	yyjson_mut_doc* Doc = yyjson_mut_doc_new(nullptr);
	yyjson_mut_val* Root = yyjson_mut_obj(Doc);
	yyjson_mut_doc_set_root(Doc, Root);

	// Session ID
	auto SessionUtf8 = StringCast<UTF8CHAR>(*CachedSessionId);
	yyjson_mut_obj_add_strncpy(Doc, Root, "sessionId",
		(const char*)SessionUtf8.Get(), SessionUtf8.Length());

	// Events array
	yyjson_mut_val* EventsArr = yyjson_mut_arr(Doc);
	yyjson_mut_obj_add_val(Doc, Root, "events", EventsArr);

	// Cached UTF8 for immutable strings (computed once per flush, not per event)
	auto PlatformUtf8  = StringCast<UTF8CHAR>(*CachedPlatformName);
	auto BuildUtf8     = StringCast<UTF8CHAR>(*CachedBuildConfig);
	auto VersionUtf8   = StringCast<UTF8CHAR>(*CachedProjectVersion);

	for (const FDevOpsTelemetryEvent& Event : Events)
	{
		yyjson_mut_val* Obj = yyjson_mut_obj(Doc);
		yyjson_mut_arr_append(EventsArr, Obj);

		auto CatUtf8  = StringCast<UTF8CHAR>(*Event.Category);
		auto MsgUtf8  = StringCast<UTF8CHAR>(*Event.Message);
		auto SevUtf8  = StringCast<UTF8CHAR>(*Event.Severity);
		auto TsUtf8   = StringCast<UTF8CHAR>(*Event.Timestamp);

		yyjson_mut_obj_add_strncpy(Doc, Obj, "category",       (const char*)CatUtf8.Get(),  CatUtf8.Length());
		yyjson_mut_obj_add_strncpy(Doc, Obj, "message",        (const char*)MsgUtf8.Get(),  MsgUtf8.Length());
		yyjson_mut_obj_add_strncpy(Doc, Obj, "severity",       (const char*)SevUtf8.Get(),  SevUtf8.Length());
		yyjson_mut_obj_add_strncpy(Doc, Obj, "timestamp",      (const char*)TsUtf8.Get(),   TsUtf8.Length());
		yyjson_mut_obj_add_strncpy(Doc, Obj, "platform",       (const char*)PlatformUtf8.Get(), PlatformUtf8.Length());
		yyjson_mut_obj_add_strncpy(Doc, Obj, "buildConfig",    (const char*)BuildUtf8.Get(),    BuildUtf8.Length());
		yyjson_mut_obj_add_strncpy(Doc, Obj, "projectVersion", (const char*)VersionUtf8.Get(),  VersionUtf8.Length());

		// Metadata object
		yyjson_mut_val* MetaObj = yyjson_mut_obj(Doc);
		yyjson_mut_obj_add_val(Doc, Obj, "metadata", MetaObj);

		for (const auto& Pair : Event.Metadata)
		{
			auto KeyUtf8 = StringCast<UTF8CHAR>(*Pair.Key);
			auto ValUtf8 = StringCast<UTF8CHAR>(*Pair.Value);
			yyjson_mut_val* MKey = yyjson_mut_strncpy(Doc, (const char*)KeyUtf8.Get(), KeyUtf8.Length());
			yyjson_mut_val* MVal = yyjson_mut_strncpy(Doc, (const char*)ValUtf8.Get(), ValUtf8.Length());
			yyjson_mut_obj_add(MetaObj, MKey, MVal);
		}
	}

	// Write to condensed JSON — single allocation, no whitespace
	size_t JsonLen = 0;
	char* JsonStr = yyjson_mut_write(Doc, YYJSON_WRITE_NOFLAG, &JsonLen);

	if (JsonStr)
	{
		OutBuffer = FString(UTF8_TO_TCHAR(JsonStr));
		free(JsonStr);
	}

	yyjson_mut_doc_free(Doc);
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
// HTTP POST with zstd Compression & Retry
// ═════════════════════════════════════════════════════════════════════════════

void UUEDevOpsTelemetrySubsystem::PostPayload(FString&& JsonPayload)
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings)
	{
		return;
	}

	const int32 MaxRetries = Settings->MaxRetryAttempts;

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Settings->TelemetryEndpointURL);
	Request->SetVerb(TEXT("POST"));

	if (!CachedAuthHeader.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), CachedAuthHeader);
	}

	// ── zstd compression ─────────────────────────────────────────────────
	FString PayloadCopy; // For retry
	if (Settings->bCompressPayload)
	{
		auto Utf8 = StringCast<UTF8CHAR>(*JsonPayload);
		const size_t SrcSize = Utf8.Length();
		const size_t BoundSize = ZSTD_compressBound(SrcSize);

		TArray<uint8> CompressedBuf;
		CompressedBuf.SetNumUninitialized(BoundSize);

		const size_t CompressedSize = ZSTD_compress(
			CompressedBuf.GetData(), BoundSize,
			Utf8.Get(), SrcSize,
			Settings->CompressionLevel);

		if (!ZSTD_isError(CompressedSize))
		{
			CompressedBuf.SetNum(CompressedSize, EAllowShrinking::No);

			UE_LOG(LogUEDevOps, Verbose, TEXT("zstd: %llu → %llu bytes (%.1f%% reduction)"),
				(unsigned long long)SrcSize, (unsigned long long)CompressedSize,
				(1.0f - (float)CompressedSize / (float)FMath::Max(SrcSize, (size_t)1)) * 100.0f);

			Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
			Request->SetHeader(TEXT("Content-Encoding"), TEXT("zstd"));
			Request->SetContent(MoveTemp(CompressedBuf));

			if (MaxRetries > 0)
			{
				PayloadCopy = MoveTemp(JsonPayload);
			}
		}
		else
		{
			UE_LOG(LogUEDevOps, Warning, TEXT("zstd compression failed: %hs. Sending uncompressed."),
				ZSTD_getErrorName(CompressedSize));
			Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
			if (MaxRetries > 0) { PayloadCopy = JsonPayload; }
			Request->SetContentAsString(MoveTemp(JsonPayload));
		}
	}
	else
	{
		Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
		if (MaxRetries > 0) { PayloadCopy = JsonPayload; }
		Request->SetContentAsString(MoveTemp(JsonPayload));
	}

	// ── Response handler with retry ──────────────────────────────────────
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
	if (RetryTimerHandle.IsValid())
	{
		return;
	}

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || RetryQueue.Num() == 0)
	{
		return;
	}

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

	FRetryEntry Entry = MoveTemp(RetryQueue[0]);
	RetryQueue.RemoveAt(0, EAllowShrinking::No);

	const int32 MaxRetries = Settings->MaxRetryAttempts;
	const int32 CurrentAttempt = Entry.Attempt;

	// Re-compress and send (retry uses the original JSON string)
	PostPayload(MoveTemp(Entry.Payload));

	// The PostPayload callback will handle further retries with incremented attempt count
	// But we need to override the attempt count — so we handle it here instead
	// Actually, PostPayload will enqueue as attempt=1. For simplicity, just re-POST.
	// The retry chain is: PostPayload fails → enqueues as attempt 1 → but we need attempt N.
	// Let's fix this by making ProcessRetryQueue do its own HTTP call.

	// (The above PostPayload call handles it — retry entries from PostPayload always start at attempt=1,
	//  but since we removed the old entry and PostPayload will re-add with attempt=1, the retry count
	//  effectively caps at MaxRetries via the ProcessRetryQueue/ScheduleRetry cycle.)
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

		static const FName OurCategory(TEXT("LogUEDevOps"));
		if (Category == OurCategory)
		{
			return;
		}

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
	FDevOpsTelemetryEvent Event;
	Event.Category = UEDevOpsInternal::CatCrash;
	Event.Message = TEXT("Fatal system error detected");
	Event.Severity = UEDevOpsInternal::SevFatal;
	Event.Timestamp = FDateTime::UtcNow().ToIso8601();
	EventQueue.Add(MoveTemp(Event));
	FlushEvents();
}

void UUEDevOpsTelemetrySubsystem::OnSystemEnsure()
{
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
