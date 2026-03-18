#include "UEDevOpsBlueprintLibrary.h"
#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "GenericPlatform/GenericPlatformMisc.h"

static UUEDevOpsTelemetrySubsystem* GetTelemetrySubsystem(const UObject* WorldContextObject)
{
	if (!WorldContextObject || !GEngine)
	{
		return nullptr;
	}

	UWorld* World = GEngine->GetWorldFromContextObject(WorldContextObject, EGetWorldErrorMode::ReturnNull);
	if (!World)
	{
		return nullptr;
	}

	UGameInstance* GI = World->GetGameInstance();
	if (!GI)
	{
		return nullptr;
	}

	return GI->GetSubsystem<UUEDevOpsTelemetrySubsystem>();
}

void UUEDevOpsBlueprintLibrary::ReportError(
	const UObject* WorldContextObject,
	const FString& Message,
	const TMap<FString, FString>& Metadata)
{
	if (UUEDevOpsTelemetrySubsystem* Sub = GetTelemetrySubsystem(WorldContextObject))
	{
		Sub->ReportError(Message, Metadata);
	}
}

void UUEDevOpsBlueprintLibrary::SendTelemetryEvent(
	const UObject* WorldContextObject,
	const FString& Category,
	const FString& Message,
	const FString& Severity,
	const TMap<FString, FString>& Metadata)
{
	FDevOpsTelemetryEvent Event;
	Event.Category = Category;
	Event.Message = Message;
	Event.Severity = Severity;
	Event.Metadata = Metadata;

	if (UUEDevOpsTelemetrySubsystem* Sub = GetTelemetrySubsystem(WorldContextObject))
	{
		// Move into subsystem — avoids copying the event
		Sub->RecordEvent(MoveTemp(Event));
	}
}

void UUEDevOpsBlueprintLibrary::ReportPerformanceMetric(
	const UObject* WorldContextObject,
	const FString& MetricName, float Value)
{
	if (UUEDevOpsTelemetrySubsystem* Sub = GetTelemetrySubsystem(WorldContextObject))
	{
		Sub->ReportPerformance(MetricName, Value);
	}
}

void UUEDevOpsBlueprintLibrary::FlushTelemetry(const UObject* WorldContextObject)
{
	if (UUEDevOpsTelemetrySubsystem* Sub = GetTelemetrySubsystem(WorldContextObject))
	{
		Sub->FlushEvents();
	}
}

int32 UUEDevOpsBlueprintLibrary::GetPendingEventCount(const UObject* WorldContextObject)
{
	if (UUEDevOpsTelemetrySubsystem* Sub = GetTelemetrySubsystem(WorldContextObject))
	{
		return Sub->GetQueuedEventCount();
	}
	return 0;
}

FString UUEDevOpsBlueprintLibrary::GetSessionId(const UObject* WorldContextObject)
{
	if (UUEDevOpsTelemetrySubsystem* Sub = GetTelemetrySubsystem(WorldContextObject))
	{
		return Sub->GetSessionId();
	}
	return FString();
}

TMap<FString, FString> UUEDevOpsBlueprintLibrary::GetDeviceInfo()
{
	TMap<FString, FString> Info;
	Info.Reserve(6);
	Info.Add(TEXT("Platform"), FPlatformProperties::PlatformName());
	Info.Add(TEXT("CPUBrand"), FPlatformMisc::GetCPUBrand());
	Info.Add(TEXT("CPUCores"), FString::FromInt(FPlatformMisc::NumberOfCores()));
	Info.Add(TEXT("GPUBrand"), FPlatformMisc::GetPrimaryGPUBrand());
	Info.Add(TEXT("OSVersion"), FPlatformMisc::GetOSVersion());
	Info.Add(TEXT("DeviceId"), FPlatformMisc::GetDeviceId());
	return Info;
}
