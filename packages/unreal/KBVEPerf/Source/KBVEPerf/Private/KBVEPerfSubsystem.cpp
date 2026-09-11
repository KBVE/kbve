#include "KBVEPerfSubsystem.h"
#include "KBVEPerf.h"

#include "CoreGlobals.h"
#include "Engine/Engine.h"
#include "RHI.h"
#include "RenderCore.h"
#include "RHIStats.h"
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
#include "RenderCore.h"

#if STATS
#include "Stats/StatsData.h"
#endif
#include "Interfaces/IPluginManager.h"
#include "Misc/FileHelper.h"
#include "Misc/StringOutputDevice.h"

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

static TAutoConsoleVariable<int32>* CVarPerfExec = new TAutoConsoleVariable<int32>(
	TEXT("kbve.perf.exec"), 1,
	TEXT("Allow /exec to run allow-listed console commands over HTTP. 0 = readout only."),
	ECVF_Default);

static TAutoConsoleVariable<int32>* CVarPerfOverlay = new TAutoConsoleVariable<int32>(
	TEXT("kbve.perf.overlay"), 0,
	TEXT("Draw the KBVEPerf on-screen overlay of the worst ops. 0 = off, 1 = on."),
	ECVF_Default);

static TAutoConsoleVariable<float>* CVarPerfWindow = new TAutoConsoleVariable<float>(
	TEXT("kbve.perf.window"), 5.0f,
	TEXT("Seconds of history the windowed figures in /perf are taken over."),
	ECVF_Default);

static TAutoConsoleVariable<float>* CVarPerfThreshold = new TAutoConsoleVariable<float>(
	TEXT("kbve.perf.threshold"), 3.0f,
	TEXT("Log sink threshold in milliseconds; scopes slower than this emit a [KBVEPerf] warning."),
	ECVF_RenderThreadSafe);

/**
 * What counts as a hitch, as a multiple of what the window is otherwise doing.
 *
 * Relative rather than absolute because the question is not answerable in
 * milliseconds alone: a 30 ms frame is a stutter in a session running at 120 and
 * is business as usual in one running at 33. What a player notices is the frame
 * that is much worse than the frames around it, so that is what is counted.
 *
 * The median is the comparison rather than the mean, because the thing being
 * measured is exactly the kind of outlier that drags a mean towards itself and
 * then hides under it.
 */
static TAutoConsoleVariable<float>* CVarPerfHitch = new TAutoConsoleVariable<float>(
	TEXT("kbve.perf.hitch"), 2.0f,
	TEXT("A frame this many times the window median counts as a hitch."),
	ECVF_Default);

/**
 * The floor under that multiple.
 *
 * Without it, a steady session counts its ordinary jitter: at a 2 ms median,
 * twice the median is 4 ms, and frames like that are noise rather than
 * something anybody felt. Nothing under this is a hitch however far above the
 * median it is.
 */
static TAutoConsoleVariable<float>* CVarPerfHitchFloor = new TAutoConsoleVariable<float>(
	TEXT("kbve.perf.hitchFloorMs"), 20.0f,
	TEXT("No frame shorter than this counts as a hitch, whatever the median is."),
	ECVF_Default);

namespace
{
	constexpr int32 SampleCap = 256;
	constexpr int32 FrameCap = 512;

	/**
	 * The samples taken inside the window, sorted, with whatever percentile is
	 * asked for.
	 *
	 * Returns nothing at all rather than a zero for an empty window: an op that
	 * has not run in the last few seconds has no recent cost, which is a
	 * different statement from costing nothing, and a readout that says 0.000
	 * for both is the readout that sent us chasing a spike that had stopped
	 * happening minutes earlier.
	 */
	bool WindowOf(const TArray<float>& Samples, const TArray<double>& At, double Since,
		TArray<float>& Out)
	{
		Out.Reset();
		const int32 Num = FMath::Min(Samples.Num(), At.Num());
		for (int32 I = 0; I < Num; ++I)
		{
			if (At[I] >= Since)
			{
				Out.Add(Samples[I]);
			}
		}
		Out.Sort();
		return Out.Num() > 0;
	}

	float Pick(const TArray<float>& Sorted, float Fraction)
	{
		if (Sorted.Num() == 0)
		{
			return 0.0f;
		}
		const int32 At = FMath::Clamp(static_cast<int32>(Fraction * (Sorted.Num() - 1)), 0,
			Sorted.Num() - 1);
		return Sorted[At];
	}
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

	// The port has to be able to move after the server is up. Command lines set
	// these one at a time and in the order they were written, so `kbve.perf 1`
	// ahead of `kbve.perf.port N` binds the default and then hears about the port
	// it was supposed to use -- which, before this, it ignored.
	CVarPerfPort->AsVariable()->SetOnChangedCallback(
		FConsoleVariableDelegate::CreateWeakLambda(this, [this](IConsoleVariable*)
		{
			if (bHttpActive && BoundPort != CVarPerfPort->GetValueOnGameThread())
			{
				StopHttp();
				StartHttp();
			}
		}));

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
	CVarPerfPort->AsVariable()->SetOnChangedCallback(FConsoleVariableDelegate());

	StopStats();
	StopHttp();
	FKBVEPerf::SetMasterEnabled(false);
	FKBVEPerf::SetSubsystem(nullptr);

	Super::Deinitialize();
}


#if STATS
namespace
{
	/**
	 * What to publish, and what to call it.
	 *
	 * Named through GET_STATFNAME rather than by their display strings, so a stat
	 * that is renamed upstream is a compile error here instead of a counter that
	 * quietly reads zero forever.
	 *
	 * Chosen to answer one question between them: of everything the renderer
	 * considered, how much did it throw away and how much did it draw. Processed
	 * against culled and occluded is the whole argument about whether anything is
	 * being drawn that does not matter -- and occlusion queries is what that
	 * answer costs, because culling is not free either.
	 */
	/**
	 * The same name with its number component removed.
	 *
	 * GET_STATFNAME returns an FName that carries a number; the same stat arriving
	 * in the stream carries none. FName equality includes that number, so the two
	 * never compare equal despite printing identically -- which is a mismatch that
	 * cannot be seen by reading the log, only by reading the trailing digits.
	 */
	FName Bare(const FName Name)
	{
		return FName(Name, 0);
	}

	void BuildWatchList(TMap<FName, FName>& Out)
	{
		Out.Reset();
		Out.Add(Bare(GET_STATFNAME(STAT_ProcessedPrimitives)), FName(TEXT("Scene.Processed")));
		Out.Add(Bare(GET_STATFNAME(STAT_CulledPrimitives)), FName(TEXT("Scene.FrustumCulled")));
		Out.Add(Bare(GET_STATFNAME(STAT_OccludedPrimitives)), FName(TEXT("Scene.Occluded")));
		Out.Add(Bare(GET_STATFNAME(STAT_StaticallyOccludedPrimitives)),
			FName(TEXT("Scene.StaticallyOccluded")));
		Out.Add(Bare(GET_STATFNAME(STAT_OcclusionQueries)), FName(TEXT("Scene.OcclusionQueries")));
		Out.Add(Bare(GET_STATFNAME(STAT_VisibleStaticMeshElements)), FName(TEXT("Scene.VisibleStatic")));
		Out.Add(Bare(GET_STATFNAME(STAT_VisibleDynamicPrimitives)), FName(TEXT("Scene.VisibleDynamic")));
		Out.Add(Bare(GET_STATFNAME(STAT_MeshDrawCalls)), FName(TEXT("Scene.MeshDrawCalls")));
	}
}
#endif

void UKBVEPerfSubsystem::StartStats()
{
#if STATS
	if (StatsEnableCount > 0)
	{
		return;
	}

	BuildWatchList(Watched);

	// Collection is off unless somebody is holding it on, and a group is dormant
	// unless somebody has asked for it. Both are counted rather than boolean, so
	// this has to be released exactly once -- hence the guard above and the count
	// below rather than a bare pair of calls.
	StatsPrimaryEnableAdd();
	++StatsEnableCount;

	// Through the command rather than SetHighPerformanceEnableForGroup, and not
	// for tidiness: a group that has not registered yet -- which is every
	// renderer group at engine startup, because nothing has declared a stat in
	// it -- is simply not found by the setter, which then does nothing at all.
	// The command remembers the intent in EnableForNewGroup and applies it when
	// the group appears. That silent no-op is why this read zero for a whole
	// evening while the listener sat there receiving three thousand messages a
	// frame and matching none of them.
	IStatGroupEnableManager& Groups = IStatGroupEnableManager::Get();
	Groups.StatGroupEnableManagerCommand(TEXT("enable initviews"));
	Groups.StatGroupEnableManagerCommand(TEXT("enable scenerendering"));

	StatsHandle = FStatsThreadState::GetLocalState().NewFrameDelegate.AddUObject(
		this, &UKBVEPerfSubsystem::OnStatsFrame);

#endif
}

void UKBVEPerfSubsystem::StopStats()
{
#if STATS
	if (StatsEnableCount <= 0)
	{
		return;
	}

	if (StatsHandle.IsValid())
	{
		FStatsThreadState::GetLocalState().NewFrameDelegate.Remove(StatsHandle);
		StatsHandle.Reset();
	}

	IStatGroupEnableManager& Groups = IStatGroupEnableManager::Get();
	Groups.StatGroupEnableManagerCommand(TEXT("disable initviews"));
	Groups.StatGroupEnableManagerCommand(TEXT("disable scenerendering"));

	StatsPrimaryEnableAdd(-1);
	--StatsEnableCount;

	FScopeLock Lock(&Mutex);
	Scene.Reset();
#endif
}

void UKBVEPerfSubsystem::OnStatsFrame(int64 Frame)
{
#if STATS
	// On the stats thread, and reading a frame that has already been condensed:
	// the counters are whole numbers collected for a frame that is over, so there
	// is nothing to sample and nothing to race against but our own map.
	const FStatsThreadState& State = FStatsThreadState::GetLocalState();
	if (Frame < State.GetOldestValidFrame() || Frame > State.GetLatestValidFrame())
	{
		return;
	}

	TMap<FName, double> Collected;
	for (const FStatMessage& Message : State.GetCondensedHistory(Frame))
	{
		// The raw name: GET_STATFNAME hands back the encoded FName, group and
		// description and all, which is exactly what the stream carries.
		const FName* Label = Watched.Find(Bare(Message.NameAndInfo.GetRawName()));
		if (!Label)
		{
			continue;
		}

		// Counters are int64 here; anything else is a cycle stat we did not ask
		// for, and guessing at its packing would publish nonsense.
		if (Message.NameAndInfo.GetField<EStatDataType>() == EStatDataType::ST_int64)
		{
			Collected.Add(*Label, static_cast<double>(Message.GetValue_int64()));
		}
	}

	// Merged rather than assigned. A counter is only in the stream on the frames
	// it was touched, so replacing wholesale means every frame that happens not
	// to mention occlusion blanks the occlusion number.
	FScopeLock Lock(&Mutex);
	for (const TPair<FName, double>& Pair : Collected)
	{
		Scene.Add(Pair.Key, Pair.Value);
	}
#endif
}

void UKBVEPerfSubsystem::ResetStats()
{
	FScopeLock Lock(&Mutex);
	Ops.Reset();
	Counts.Reset();
	Recent.Reset();
	RecentHead = 0;
	FrameMs.Reset();
	FrameAt.Reset();
	FrameHead = 0;
}

void UKBVEPerfSubsystem::ApplyEnabledState()
{
	const bool bOn = CVarPerf->GetValueOnGameThread() != 0;
	FKBVEPerf::SetMasterEnabled(bOn);

	if (bOn)
	{
		StartStats();
	}
	else
	{
		StopStats();
	}

	// The page and the collection are two switches, and in the editor only one
	// of them is off by default.
	//
	// Serving only while collecting made the readout unreachable exactly when it
	// was wanted: a page that does not exist until collection is on cannot be
	// the thing that turns collection on, and it went away again the moment Play
	// stopped -- which is the one moment there is something worth reading. An
	// idle listener on a loopback port costs nothing; the collection is the part
	// with a cost, and that stays behind `kbve.perf`.
	//
	// Outside the editor there is nothing to serve until somebody asks, so the
	// old coupling stands.
	if (bOn || WITH_EDITOR)
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
		const double At = FPlatformTime::Seconds();
		if (Stat.Samples.Num() < SampleCap)
		{
			Stat.Samples.Add(static_cast<float>(Ms));
			Stat.SampleAt.Add(At);
		}
		else
		{
			Stat.Samples[Stat.SampleHead] = static_cast<float>(Ms);
			Stat.SampleAt[Stat.SampleHead] = At;
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

	const double Window = FMath::Max(CVarPerfWindow->GetValueOnAnyThread(), 0.1f);
	const double Since = FPlatformTime::Seconds() - Window;
	// What the last few seconds looked like, which is the question somebody
	// watching a live readout is asking. A frame much longer than its neighbours
	// is counted rather than averaged away: one 40ms frame in a hundred is
	// invisible in a mean and is the whole of what a player feels.
	TArray<float> Frames;
	const bool bFrames = WindowOf(FrameMs, FrameAt, Since, Frames);

	// Derived from the window rather than fixed, and reported alongside the
	// count so the count can be read. This used to borrow kbve.perf.threshold,
	// which is the log sink's limit for a single op scope -- 3 ms, a sensible
	// number for a scope and an absurd one for a frame, so every frame of a 60
	// fps session was a hitch and the field said nothing.
	const float Median = bFrames ? Pick(Frames, 0.50f) : 0.0f;
	const float Hitch = FMath::Max(
		Median * FMath::Max(CVarPerfHitch->GetValueOnAnyThread(), 1.0f),
		CVarPerfHitchFloor->GetValueOnAnyThread());

	int32 Hitches = 0;
	float WorstHitchMs = 0.0f;
	for (const float At : Frames)
	{
		if (At > Hitch)
		{
			++Hitches;
			WorstHitchMs = FMath::Max(WorstHitchMs, At);
		}
	}

	FString Out;
	Out += FString::Printf(
		TEXT("{\"enabled\":%s,\"frame\":%llu,\"fps\":%.1f,\"gameMs\":%.3f,\"renderMs\":%.3f,")
			TEXT("\"gpuMs\":%.3f,\"rhiMs\":%.3f,\"windowSec\":%.1f,\"windowFrames\":%d,")
			TEXT("\"frameP50Ms\":%.2f,\"frameP95Ms\":%.2f,\"frameP99Ms\":%.2f,\"frameMaxMs\":%.2f,")
			TEXT("\"hitches\":%d,\"hitchOverMs\":%.2f,\"worstHitchMs\":%.2f,\"ops\":["),
		CVarPerf->GetValueOnGameThread() != 0 ? TEXT("true") : TEXT("false"),
		static_cast<uint64>(GFrameCounter), CachedFps, CachedGameMs, CachedRenderMs, CachedGpuMs,
		CachedRhiMs, Window, Frames.Num(),
		bFrames ? Pick(Frames, 0.50f) : 0.0f,
		bFrames ? Pick(Frames, 0.95f) : 0.0f,
		bFrames ? Pick(Frames, 0.99f) : 0.0f,
		bFrames ? Frames.Last() : 0.0f,
		Hitches, Hitch, WorstHitchMs);

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
		// Lifetime figures kept beside the windowed ones rather than replaced.
		// A maximum since the reset is worth knowing -- it is just not worth
		// mistaking for what is happening now, which is what happens when it is
		// the only maximum on offer.
		TArray<float> Win;
		const bool bWin = WindowOf(Stat.Samples, Stat.SampleAt, Since, Win);
		double WinSum = 0.0;
		for (const float At : Win)
		{
			WinSum += At;
		}

		Out += FString::Printf(
			TEXT("{\"name\":\"%s\",\"count\":%llu,\"lastMs\":%.3f,\"maxMs\":%.3f,\"avgMs\":%.3f,")
				TEXT("\"p95Ms\":%.3f,\"winCount\":%d,\"winAvgMs\":%.3f,\"winP95Ms\":%.3f,")
				TEXT("\"winMaxMs\":%.3f}"),
			*Pair.Key.ToString(), Stat.Count, Stat.LastMs, Stat.MaxMs, Avg, P95,
			Win.Num(),
			bWin ? WinSum / Win.Num() : 0.0,
			bWin ? Pick(Win, 0.95f) : 0.0f,
			bWin ? Win.Last() : 0.0f);
	}

	Out += TEXT("],\"counts\":[");
	bFirst = true;

	if (CachedDrawCalls > 0 || CachedPrimitives > 0)
	{
		Out += FString::Printf(
			TEXT("{\"name\":\"RHI.DrawCalls\",\"value\":%d},{\"name\":\"RHI.Triangles\",\"value\":%d}"),
			CachedDrawCalls, CachedPrimitives);
		bFirst = false;
	}

	for (const TPair<FName, double>& Pair : Scene)
	{
		if (!bFirst)
		{
			Out += TEXT(",");
		}
		bFirst = false;
		Out += FString::Printf(TEXT("{\"name\":\"%s\",\"value\":%.0f}"), *Pair.Key.ToString(),
			Pair.Value);
	}

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

	// The readout itself, on the same port the numbers are on, and reached by
	// opening the port with nothing after it.
	//
	// A preprocessor rather than a route because root is not a path a route can
	// have: `FHttpPath::IsValidPath` returns false for it and `BindRoute` checks
	// that, so binding "/" takes the whole process down. This runs before the
	// router on every request and passes everything it does not want straight
	// through, which is what leaves /perf where it was.
	//
	// Served off disk rather than compiled in so the page can be edited and
	// reloaded against a running game -- and read per request for the same
	// reason. It is a few kilobytes asked for once per refresh; a cache here
	// would only make editing it pointless.
	PageHandle = Router->RegisterRequestPreprocessor(FHttpRequestHandler::CreateWeakLambda(this,
		[this](const FHttpServerRequest& Request, const FHttpResultCallback& OnComplete)
		{
			const FString Path = Request.RelativePath.GetPath();

			// Now that the endpoint outlives a play session, the scopes it has
			// collected do too -- so there has to be a way to say "from here",
			// or every reading is the average of every run since the editor
			// opened.
			if (Path == TEXT("/reset"))
			{
				ResetStats();
				const FString Body(TEXT("{\"reset\":true}"));
				TUniquePtr<FHttpServerResponse> Cleared =
					FHttpServerResponse::Create(Body, TEXT("application/json"));
				Cleared->Headers.Add(TEXT("Access-Control-Allow-Origin"), { TEXT("*") });
				OnComplete(MoveTemp(Cleared));
				return true;
			}

#if WITH_EDITOR
			// The way back in. A readout that can only be watched means every
			// experiment is a walk to the editor window to type a cvar, and the
			// numbers that say whether it worked are on this page.
			//
			// Editor builds only, and an allow-list rather than the console: this
			// is an unauthenticated endpoint on every interface the machine has,
			// so what it can do had better be a short list. Flipping a cvar and
			// toggling a stat group is the whole use for it; `quit`, `obj gc` and
			// everything else is refused by not being named here.
			if (Path == TEXT("/exec"))
			{
				// Scalability with the rest of them. What a player runs at is a
				// scalability level rather than a list of cvars, so a readout
				// that can set every underlying knob but not the group is one
				// that can measure everything except what somebody will play.
				static const TCHAR* Allowed[] = { TEXT("kbve."), TEXT("r."), TEXT("stat "),
					TEXT("showflag."), TEXT("t.MaxFPS"), TEXT("fx."), TEXT("sg.") };

				const FString* Command = Request.QueryParams.Find(TEXT("cmd"));
				const FString Wanted = Command ? Command->TrimStartAndEnd() : FString();

				bool bAllowed = false;
				for (const TCHAR* Prefix : Allowed)
				{
					bAllowed |= Wanted.StartsWith(Prefix, ESearchCase::IgnoreCase);
				}

				FString Body;
				if (CVarPerfExec->GetValueOnGameThread() == 0)
				{
					Body = TEXT("{\"error\":\"kbve.perf.exec is 0\"}");
				}
				else if (Wanted.IsEmpty())
				{
					Body = TEXT("{\"error\":\"no cmd\"}");
				}
				else if (!bAllowed)
				{
					Body = TEXT("{\"error\":\"not allow-listed: kbve. r. stat showflag. t.MaxFPS fx. sg.\"}");
				}
				else
				{
					// Answered with what the console said rather than with an
					// acknowledgement: a command whose output goes to a log
					// nobody is reading is one you cannot tell has failed.
					FStringOutputDevice Output;
					UWorld* World = nullptr;

					if (GEngine)
					{
						for (const FWorldContext& Context : GEngine->GetWorldContexts())
						{
							if (Context.WorldType == EWorldType::PIE
								|| Context.WorldType == EWorldType::Game)
							{
								World = Context.World();
								break;
							}
						}
						GEngine->Exec(World, *Wanted, Output);
					}

					FString Said = Output;
					Said.ReplaceInline(TEXT("\\"), TEXT("\\\\"));
					Said.ReplaceInline(TEXT("\""), TEXT("\\\""));
					Said.ReplaceInline(TEXT("\r"), TEXT(""));
					Said.ReplaceInline(TEXT("\n"), TEXT("\\n"));
					Body = FString::Printf(TEXT("{\"ran\":\"%s\",\"output\":\"%s\"}"),
						*Wanted.Replace(TEXT("\""), TEXT("\\\"")), *Said);
				}

				TUniquePtr<FHttpServerResponse> Ran =
					FHttpServerResponse::Create(Body, TEXT("application/json"));
				Ran->Headers.Add(TEXT("Access-Control-Allow-Origin"), { TEXT("*") });
				OnComplete(MoveTemp(Ran));
				return true;
			}
#endif

			if (Path != TEXT("/") && Path != TEXT("/index.html"))
			{
				return false;
			}

			FString Page;
			const TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("KBVEPerf"));
			const FString File = Plugin.IsValid()
				? Plugin->GetBaseDir() / TEXT("Web") / TEXT("index.html")
				: FString();

			TUniquePtr<FHttpServerResponse> Response;
			if (!File.IsEmpty() && FFileHelper::LoadFileToString(Page, *File))
			{
				Response = FHttpServerResponse::Create(Page, TEXT("text/html; charset=utf-8"));
			}
			else
			{
				// Said plainly rather than served as a blank page: the JSON is
				// still there, and where the page was looked for is the whole of
				// what went wrong.
				Response = FHttpServerResponse::Create(
					FString::Printf(TEXT("KBVEPerf: no page at %s -- /perf still serves JSON."),
						*File),
					TEXT("text/plain; charset=utf-8"));
			}

			Response->Headers.Add(TEXT("Cache-Control"), { TEXT("no-store") });
			OnComplete(MoveTemp(Response));
			return true;
		}));

	Server.StartAllListeners();
	BoundPort = Port;
	bHttpActive = true;
	UE_LOG(LogKBVEPerf, Log, TEXT("KBVEPerf live at http://localhost:%d/ (JSON at /perf)"), BoundPort);
}

void UKBVEPerfSubsystem::StopHttp()
{
	if (Router.IsValid() && PageHandle.IsValid())
	{
		Router->UnregisterRequestPreprocessor(PageHandle);
	}
	PageHandle.Reset();

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

	{
		FScopeLock Lock(&Mutex);
		const double At = FPlatformTime::Seconds();
		const float Ms = DeltaSeconds * 1000.0f;
		if (FrameMs.Num() < FrameCap)
		{
			FrameMs.Add(Ms);
			FrameAt.Add(At);
		}
		else
		{
			FrameMs[FrameHead] = Ms;
			FrameAt[FrameHead] = At;
			FrameHead = (FrameHead + 1) % FrameCap;
		}
	}
	CachedGameMs = FPlatformTime::ToMilliseconds(GGameThreadTime);
	CachedRenderMs = FPlatformTime::ToMilliseconds(GRenderThreadTime);
	CachedGpuMs = FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles());
	CachedRhiMs = FPlatformTime::ToMilliseconds(GRHIThreadTime);

	// Retested now that the stat groups are actually collecting: these are
	// filled by the GPU profiler's per-frame draw stats, and whether the Metal
	// RHI feeds them is the question. Zero here means nobody counted, not that
	// nothing was drawn -- so they are only published when they are non-zero.
	CachedDrawCalls = GNumDrawCallsRHI[0];
	CachedPrimitives = GNumPrimitivesDrawnRHI[0];

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
