#include "UnrChunkSubsystem.h"

#include "Engine/Engine.h"
#include "HAL/IConsoleManager.h"
#include "KBVEUnr.h"

THIRD_PARTY_INCLUDES_START
#include "unr.h"
THIRD_PARTY_INCLUDES_END

void UUnrChunkSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);

	ScratchBuffer.SetNumUninitialized(static_cast<int32>(unr_chunk_samples()));

	TickerHandle = FTSTicker::GetCoreTicker().AddTicker(
		FTickerDelegate::CreateUObject(this, &UUnrChunkSubsystem::Tick));

	UE_LOG(LogKBVEUnr, Display,
		TEXT("chunk subsystem ready (unr %s, %d samples/chunk)"),
		ANSI_TO_TCHAR(unr_version()), unr_chunk_samples());
}

void UUnrChunkSubsystem::Deinitialize()
{
	if (TickerHandle.IsValid())
	{
		FTSTicker::GetCoreTicker().RemoveTicker(TickerHandle);
		TickerHandle.Reset();
	}

	// Whatever is still in flight will finish into a queue nobody drains, so
	// release the payloads rather than leaving them retained for the process
	// lifetime.
	for (const uint64 Ticket : Outstanding)
	{
		unr_chunk_cancel(Ticket);
		unr_chunk_release(Ticket);
	}
	Outstanding.Reset();

	Super::Deinitialize();
}

uint64 UUnrChunkSubsystem::Submit(int32 Seed, int32 ChunkX, int32 ChunkY)
{
	if (BatchSubmitted == 0)
	{
		BatchStartSeconds = FPlatformTime::Seconds();
	}
	++BatchSubmitted;

	const uint64 Ticket = unr_chunk_submit(static_cast<uint32>(Seed), ChunkX, ChunkY);
	Outstanding.Add(Ticket);
	return Ticket;
}

bool UUnrChunkSubsystem::Tick(float DeltaTime)
{
	TArray<UnrChunkDone, TInlineAllocator<8>> Done;
	Done.SetNumUninitialized(MaxDrainPerTick);

	const uint32 Count = unr_drain_completed(Done.GetData(), static_cast<uint32>(MaxDrainPerTick));
	for (uint32 i = 0; i < Count; ++i)
	{
		const UnrChunkDone& Result = Done[static_cast<int32>(i)];
		Outstanding.Remove(Result.ticket);

		if (Result.status != UNR_CHUNK_OK)
		{
			++Cancelled;
			continue;
		}

		// Unreal owns the buffer; Rust fills it. Nothing crosses the allocator
		// boundary, so there is no matching free to forget.
		if (unr_chunk_copy_into(Result.ticket, ScratchBuffer.GetData(),
				static_cast<uint32>(ScratchBuffer.Num())))
		{
			float Sum = 0.0f;
			for (const float Sample : ScratchBuffer)
			{
				Sum += Sample;
			}
			LastChecksum = Sum;
			++Received;
		}
		else
		{
			UE_LOG(LogKBVEUnr, Warning,
				TEXT("chunk %llu completed but the payload would not copy"), Result.ticket);
			unr_chunk_release(Result.ticket);
		}
	}

	if (Count > 0 && Outstanding.Num() == 0 && BatchSubmitted > 0)
	{
		const double ElapsedMs = (FPlatformTime::Seconds() - BatchStartSeconds) * 1000.0;
		UE_LOG(LogKBVEUnr, Display,
			TEXT("batch drained: %d chunks in %.2f ms wall (received=%d cancelled=%d checksum=%.4f)"),
			BatchSubmitted, ElapsedMs, Received, Cancelled, LastChecksum);
		BatchSubmitted = 0;
	}

	return true;
}

static UUnrChunkSubsystem* GetChunkSubsystem()
{
	return GEngine ? GEngine->GetEngineSubsystem<UUnrChunkSubsystem>() : nullptr;
}

static void UnrChunkSubmitCmd(const TArray<FString>& Args)
{
	UUnrChunkSubsystem* Subsystem = GetChunkSubsystem();
	if (!Subsystem)
	{
		UE_LOG(LogKBVEUnr, Error, TEXT("chunk subsystem unavailable"));
		return;
	}

	const int32 Count = Args.Num() > 0 ? FMath::Max(1, FCString::Atoi(*Args[0])) : 16;

	// Timed on purpose: this is the claim being tested. If submit were doing
	// the bake rather than queueing it, the number below would say so.
	const double Start = FPlatformTime::Seconds();
	for (int32 i = 0; i < Count; ++i)
	{
		Subsystem->Submit(1337, i, 0);
	}
	const double ElapsedMs = (FPlatformTime::Seconds() - Start) * 1000.0;

	UE_LOG(LogKBVEUnr, Display,
		TEXT("submitted %d chunks in %.3f ms on the game thread (%d outstanding)"),
		Count, ElapsedMs, Subsystem->GetOutstanding());
}

static void UnrChunkStatsCmd()
{
	UUnrChunkSubsystem* Subsystem = GetChunkSubsystem();
	if (!Subsystem)
	{
		UE_LOG(LogKBVEUnr, Error, TEXT("chunk subsystem unavailable"));
		return;
	}

	UE_LOG(LogKBVEUnr, Display,
		TEXT("chunks: outstanding=%d received=%d cancelled=%d retained=%u checksum=%.4f"),
		Subsystem->GetOutstanding(), Subsystem->GetReceived(), Subsystem->GetCancelled(),
		unr_chunk_retained(), Subsystem->GetLastChecksum());
}

static FAutoConsoleCommand GUnrChunkSubmitCmd(
	TEXT("unr.Chunk.Submit"),
	TEXT("Queue N chunk bakes on the unr tokio pool. Usage: unr.Chunk.Submit [count=16]"),
	FConsoleCommandWithArgsDelegate::CreateStatic(&UnrChunkSubmitCmd));

static FAutoConsoleCommand GUnrChunkStatsCmd(
	TEXT("unr.Chunk.Stats"),
	TEXT("Report outstanding / received / cancelled chunk jobs."),
	FConsoleCommandDelegate::CreateStatic(&UnrChunkStatsCmd));
