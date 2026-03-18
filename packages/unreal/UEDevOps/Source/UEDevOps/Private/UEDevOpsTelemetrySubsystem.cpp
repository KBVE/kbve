#include "UEDevOpsTelemetrySubsystem.h"
#include "UEDevOpsSettings.h"
#include "HttpModule.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Serialization/JsonWriter.h"
#include "Serialization/JsonSerializer.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Misc/App.h"
#include "Misc/DateTime.h"
#include "TimerManager.h"

void UUEDevOpsTelemetrySubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings)
	{
		return;
	}

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

void UUEDevOpsTelemetrySubsystem::RecordEvent(const FDevOpsTelemetryEvent& InEvent)
{
	FDevOpsTelemetryEvent Event = InEvent;
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
	Event.Category = TEXT("error");
	Event.Message = Message;
	Event.Severity = TEXT("error");
	Event.Metadata = Metadata;
	RecordEvent(Event);
}

void UUEDevOpsTelemetrySubsystem::ReportPerformance(const FString& MetricName, float Value)
{
	FDevOpsTelemetryEvent Event;
	Event.Category = TEXT("performance");
	Event.Message = MetricName;
	Event.Severity = TEXT("info");
	Event.Metadata.Add(TEXT("value"), FString::SanitizeFloat(Value));
	RecordEvent(Event);
}

void UUEDevOpsTelemetrySubsystem::FlushEvents()
{
	if (EventQueue.Num() == 0)
	{
		return;
	}

	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || Settings->TelemetryEndpointURL.IsEmpty())
	{
		UE_LOG(LogTemp, Warning, TEXT("UEDevOps: TelemetryEndpointURL is not configured. Discarding %d events."), EventQueue.Num());
		EventQueue.Empty();
		return;
	}

	FString Payload = SerializeQueue();
	EventQueue.Empty();
	PostPayload(Payload);
}

int32 UUEDevOpsTelemetrySubsystem::GetQueuedEventCount() const
{
	return EventQueue.Num();
}

void UUEDevOpsTelemetrySubsystem::OnTimerFlush()
{
	FlushEvents();
}

FString UUEDevOpsTelemetrySubsystem::SerializeQueue() const
{
	TArray<TSharedPtr<FJsonValue>> EventArray;

	for (const FDevOpsTelemetryEvent& Event : EventQueue)
	{
		TSharedPtr<FJsonObject> Obj = MakeShared<FJsonObject>();
		Obj->SetStringField(TEXT("category"), Event.Category);
		Obj->SetStringField(TEXT("message"), Event.Message);
		Obj->SetStringField(TEXT("severity"), Event.Severity);
		Obj->SetStringField(TEXT("timestamp"), Event.Timestamp);

		// Platform & build info
		Obj->SetStringField(TEXT("platform"), FPlatformProperties::PlatformName());
		Obj->SetStringField(TEXT("buildConfig"), LexToString(FApp::GetBuildConfiguration()));
		Obj->SetStringField(TEXT("projectVersion"), FApp::GetBuildVersion());

		TSharedPtr<FJsonObject> MetaObj = MakeShared<FJsonObject>();
		for (const auto& Pair : Event.Metadata)
		{
			MetaObj->SetStringField(Pair.Key, Pair.Value);
		}
		Obj->SetObjectField(TEXT("metadata"), MetaObj);

		EventArray.Add(MakeShared<FJsonValueObject>(Obj));
	}

	TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetArrayField(TEXT("events"), EventArray);

	FString Output;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
	FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
	return Output;
}

void UUEDevOpsTelemetrySubsystem::PostPayload(const FString& JsonPayload)
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
	Request->SetURL(Settings->TelemetryEndpointURL);
	Request->SetVerb(TEXT("POST"));
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));

	if (!Settings->TelemetryAuthToken.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Settings->TelemetryAuthToken));
	}

	Request->SetContentAsString(JsonPayload);

	Request->OnProcessRequestComplete().BindLambda(
		[](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bSuccess)
		{
			if (!bSuccess || !Resp.IsValid() || !EHttpResponseCodes::IsOk(Resp->GetResponseCode()))
			{
				UE_LOG(LogTemp, Warning, TEXT("UEDevOps: Telemetry POST failed (code %d)"),
					Resp.IsValid() ? Resp->GetResponseCode() : 0);
			}
		});

	Request->ProcessRequest();
}

void UUEDevOpsTelemetrySubsystem::SetupLogCapture()
{
	const UUEDevOpsSettings* Settings = UUEDevOpsSettings::Get();
	if (!Settings || !Settings->bAutoCaptureLogs)
	{
		return;
	}

	const ELogVerbosity::Type EngineMinVerbosity = UUEDevOpsSettings::ToEngineVerbosity(Settings->MinLogVerbosity);
	LogOutputHandle = FOutputDeviceRedirector::Get()->OnLogMessage().AddLambda(
		[this, MinVerbosity = EngineMinVerbosity](const TCHAR* Message, ELogVerbosity::Type Verbosity, const FName& Category)
		{
			if (Verbosity <= MinVerbosity)
			{
				FDevOpsTelemetryEvent Event;
				Event.Category = TEXT("log");
				Event.Message = Message;

				switch (Verbosity)
				{
				case ELogVerbosity::Fatal:   Event.Severity = TEXT("fatal"); break;
				case ELogVerbosity::Error:   Event.Severity = TEXT("error"); break;
				case ELogVerbosity::Warning: Event.Severity = TEXT("warning"); break;
				default:                     Event.Severity = TEXT("info"); break;
				}

				Event.Metadata.Add(TEXT("logCategory"), Category.ToString());
				RecordEvent(Event);
			}
		});
}

void UUEDevOpsTelemetrySubsystem::TeardownLogCapture()
{
	if (LogOutputHandle.IsValid())
	{
		FOutputDeviceRedirector::Get()->OnLogMessage().Remove(LogOutputHandle);
		LogOutputHandle.Reset();
	}
}
