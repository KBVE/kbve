#include "KBVEPerfSubsystem.h"
#include "KBVEPerf.h"

#include "CoreGlobals.h"
#include "Engine/Engine.h"
#include "RHI.h"
#include "RenderCore.h"
#include "RenderingThread.h"
#include "RenderTimer.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformTLS.h"
#include "HttpPath.h"
#include "HttpResultCallback.h"
#include "HttpServerModule.h"
#include "HttpServerRequest.h"
#include "HttpServerResponse.h"
#include "IHttpRouter.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEPerf, Log, All);

static TAutoConsoleVariable<int32>* CVarPerf = new TAutoConsoleVariable<int32>(
	TEXT("kbve.perf"), 0,
	TEXT("Master switch for KBVEPerf collection. 0 = off (zero overhead), 1 = on."),
	ECVF_Default);

static TAutoConsoleVariable<FString>* CVarPerfCategories = new TAutoConsoleVariable<FString>(
	TEXT("kbve.perf.categories"), TEXT(""),
	TEXT("Comma-separated category allow-list (e.g. \"Grass,Terrain\"). Empty = all categories."),
	ECVF_Default);

static TAutoConsoleVariable<int32>* CVarPerfPort = new TAutoConsoleVariable<int32>(
	TEXT("kbve.perf.port"), 8099,
	TEXT("Port for the KBVEPerf HTTP /perf JSON readout."),
	ECVF_Default);

static TAutoConsoleVariable<int32>* CVarPerfOverlay = new TAutoConsoleVariable<int32>(
	TEXT("kbve.perf.overlay"), 0,
	TEXT("Draw the KBVEPerf on-screen overlay of the worst ops. 0 = off, 1 = on."),
	ECVF_Default);

static TAutoConsoleVariable<float>* CVarPerfThreshold = new TAutoConsoleVariable<float>(
	TEXT("kbve.perf.threshold"), 3.0f,
	TEXT("Log sink threshold in milliseconds; scopes slower than this emit a [KBVEPerf] warning."),
	ECVF_RenderThreadSafe);

namespace
{
	constexpr int32 SampleCap = 256;
	constexpr int32 RecentCap = 256;
	constexpr uint64 OverlayKeyBase = 0x4B56455046ULL;
}

void UKBVEPerfSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	FKBVEPerf::SetSubsystem(this);

	MasterCVar = CVarPerf->AsVariable();
	MasterCVar->SetOnChangedCallback(
		FConsoleVariableDelegate::CreateWeakLambda(this, [this](IConsoleVariable*) { ApplyEnabledState(); }));
	CVarPerfCategories->AsVariable()->SetOnChangedCallback(
		FConsoleVariableDelegate::CreateWeakLambda(this, [this](IConsoleVariable*) { RebuildCategoryFilter(); }));

	RebuildCategoryFilter();
	ApplyEnabledState();

	TickHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateUObject(this, &UKBVEPerfSubsystem::Tick));
}

void UKBVEPerfSubsystem::Deinitialize()
{
	if (TickHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
		TickHandle.Reset();
	}

	if (MasterCVar)
	{
		MasterCVar->SetOnChangedCallback(FConsoleVariableDelegate());
		MasterCVar = nullptr;
	}
	CVarPerfCategories->AsVariable()->SetOnChangedCallback(FConsoleVariableDelegate());

	StopHttp();
	FKBVEPerf::SetMasterEnabled(false);
	FKBVEPerf::SetSubsystem(nullptr);

	Super::Deinitialize();
}

void UKBVEPerfSubsystem::ApplyEnabledState()
{
	const bool bOn = CVarPerf->GetValueOnGameThread() != 0;
	FKBVEPerf::SetMasterEnabled(bOn);
	if (bOn)
	{
		StartHttp();
	}
	else
	{
		StopHttp();
	}
}

void UKBVEPerfSubsystem::RebuildCategoryFilter()
{
	const FString Raw = CVarPerfCategories->GetValueOnGameThread();
	TSet<FName> Set;
	bool bAll = Raw.IsEmpty();
	if (!bAll)
	{
		TArray<FString> Parts;
		Raw.ParseIntoArray(Parts, TEXT(","), true);
		for (FString& Part : Parts)
		{
			Part.TrimStartAndEndInline();
			if (!Part.IsEmpty())
			{
				Set.Add(FName(*Part));
			}
		}
		bAll = Set.Num() == 0;
	}

	bAllCategories = bAll;
	CategoryFilter = Set;
	FKBVEPerf::SetCategories(Set, bAll);
}

bool UKBVEPerfSubsystem::IsCategoryEnabled(FName Category) const
{
	return bAllCategories || CategoryFilter.Contains(Category);
}

void UKBVEPerfSubsystem::SubmitScope(FName Name, FName Category, double Ms)
{
	{
		FScopeLock Lock(&Mutex);
		FKBVEPerfOpStat& Stat = Ops.FindOrAdd(Name);
		Stat.Count++;
		Stat.LastMs = Ms;
		Stat.MaxMs = FMath::Max(Stat.MaxMs, Ms);
		Stat.SumMs += Ms;
		if (Stat.Samples.Num() < SampleCap)
		{
			Stat.Samples.Add(static_cast<float>(Ms));
		}
		else
		{
			Stat.Samples[Stat.SampleHead] = static_cast<float>(Ms);
			Stat.SampleHead = (Stat.SampleHead + 1) % SampleCap;
		}

		FKBVEPerfEvent Event;
		Event.Name = Name;
		Event.Ms = Ms;
		Event.Frame = GFrameCounter;
		Event.ThreadId = FPlatformTLS::GetCurrentThreadId();
		if (Recent.Num() < RecentCap)
		{
			Recent.Add(Event);
		}
		else
		{
			Recent[RecentHead] = Event;
			RecentHead = (RecentHead + 1) % RecentCap;
		}
	}

	const float Threshold = CVarPerfThreshold->GetValueOnAnyThread();
	if (Ms > Threshold)
	{
		UE_LOG(LogKBVEPerf, Warning, TEXT("[KBVEPerf] %s %.1fms"), *Name.ToString(), Ms);
	}
}

void UKBVEPerfSubsystem::SubmitCount(FName Name, double Value)
{
	FScopeLock Lock(&Mutex);
	Counts.FindOrAdd(Name) = Value;
}

FString UKBVEPerfSubsystem::BuildJson() const
{
	FScopeLock Lock(&Mutex);

	FString Out;
	Out += FString::Printf(
		TEXT("{\"frame\":%llu,\"fps\":%.1f,\"gameMs\":%.3f,\"renderMs\":%.3f,\"gpuMs\":%.3f,\"rhiMs\":%.3f,\"ops\":["),
		static_cast<uint64>(GFrameCounter), CachedFps, CachedGameMs, CachedRenderMs, CachedGpuMs, CachedRhiMs);

	bool bFirst = true;
	for (const TPair<FName, FKBVEPerfOpStat>& Pair : Ops)
	{
		const FKBVEPerfOpStat& Stat = Pair.Value;
		const double Avg = Stat.Count > 0 ? Stat.SumMs / static_cast<double>(Stat.Count) : 0.0;

		TArray<float> Sorted = Stat.Samples;
		Sorted.Sort();
		const float P95 = Sorted.Num() > 0
			? Sorted[FMath::Clamp(static_cast<int32>(0.95f * (Sorted.Num() - 1)), 0, Sorted.Num() - 1)]
			: 0.0f;

		if (!bFirst)
		{
			Out += TEXT(",");
		}
		bFirst = false;
		Out += FString::Printf(
			TEXT("{\"name\":\"%s\",\"count\":%llu,\"lastMs\":%.3f,\"maxMs\":%.3f,\"avgMs\":%.3f,\"p95Ms\":%.3f}"),
			*Pair.Key.ToString(), Stat.Count, Stat.LastMs, Stat.MaxMs, Avg, P95);
	}

	Out += TEXT("],\"counts\":[");
	bFirst = true;
	for (const TPair<FName, double>& Pair : Counts)
	{
		if (!bFirst)
		{
			Out += TEXT(",");
		}
		bFirst = false;
		Out += FString::Printf(TEXT("{\"name\":\"%s\",\"value\":%.3f}"), *Pair.Key.ToString(), Pair.Value);
	}

	Out += TEXT("]}");
	return Out;
}

void UKBVEPerfSubsystem::StartHttp()
{
	if (bHttpActive)
	{
		return;
	}

	const int32 Port = CVarPerfPort->GetValueOnGameThread();
	FHttpServerModule& Server = FHttpServerModule::Get();
	Router = Server.GetHttpRouter(Port);
	if (!Router.IsValid())
	{
		UE_LOG(LogKBVEPerf, Warning, TEXT("KBVEPerf failed to acquire HTTP router on port %d"), Port);
		return;
	}

	RouteHandle = Router->BindRoute(
		FHttpPath(TEXT("/perf")),
		EHttpServerRequestVerbs::VERB_GET,
		FHttpRequestHandler::CreateWeakLambda(this,
			[this](const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
			{
				TUniquePtr<FHttpServerResponse> Response =
					FHttpServerResponse::Create(BuildJson(), TEXT("application/json"));
				Response->Headers.Add(TEXT("Access-Control-Allow-Origin"), { TEXT("*") });
				Response->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
				OnComplete(MoveTemp(Response));
				return true;
			}));

	if (!RouteHandle.IsValid())
	{
		Router.Reset();
		UE_LOG(LogKBVEPerf, Warning, TEXT("KBVEPerf failed to bind /perf route on port %d"), Port);
		return;
	}

	Server.StartAllListeners();
	BoundPort = Port;
	bHttpActive = true;
	UE_LOG(LogKBVEPerf, Log, TEXT("KBVEPerf /perf live at http://localhost:%d/perf"), BoundPort);
}

void UKBVEPerfSubsystem::StopHttp()
{
	if (Router.IsValid() && RouteHandle.IsValid())
	{
		Router->UnbindRoute(RouteHandle);
	}
	RouteHandle.Reset();
	Router.Reset();
	BoundPort = 0;
	bHttpActive = false;
}

bool UKBVEPerfSubsystem::Tick(float DeltaSeconds)
{
	CachedFps = DeltaSeconds > 0.0f ? 1.0f / DeltaSeconds : 0.0f;
	CachedGameMs = FPlatformTime::ToMilliseconds(GGameThreadTime);
	CachedRenderMs = FPlatformTime::ToMilliseconds(GRenderThreadTime);
	CachedGpuMs = FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles());
	CachedRhiMs = FPlatformTime::ToMilliseconds(GRHIThreadTime);

	if (CVarPerfOverlay->GetValueOnGameThread() != 0 && FKBVEPerf::IsEnabled() && GEngine)
	{
		TArray<TPair<FName, double>> Worst;
		{
			FScopeLock Lock(&Mutex);
			Worst.Reserve(Ops.Num());
			for (const TPair<FName, FKBVEPerfOpStat>& Pair : Ops)
			{
				Worst.Emplace(Pair.Key, Pair.Value.LastMs);
			}
		}
		Worst.Sort([](const TPair<FName, double>& A, const TPair<FName, double>& B) { return A.Value > B.Value; });

		GEngine->AddOnScreenDebugMessage(OverlayKeyBase, 0.0f, FColor::Green,
			FString::Printf(TEXT("[KBVEPerf] fps %.0f | game %.1f draw %.1f gpu %.1f rhi %.1f ms"),
				CachedFps, CachedGameMs, CachedRenderMs, CachedGpuMs, CachedRhiMs));
		const int32 N = FMath::Min(8, Worst.Num());
		for (int32 i = 0; i < N; ++i)
		{
			GEngine->AddOnScreenDebugMessage(OverlayKeyBase + 1 + i, 0.0f, FColor::Yellow,
				FString::Printf(TEXT("  %s %.1fms"), *Worst[i].Key.ToString(), Worst[i].Value));
		}
	}

	return true;
}
