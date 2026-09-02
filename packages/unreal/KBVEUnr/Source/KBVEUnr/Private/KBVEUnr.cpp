#include "KBVEUnr.h"

#include "HAL/IConsoleManager.h"
#include "Modules/ModuleManager.h"

THIRD_PARTY_INCLUDES_START
#include "unr.h"
THIRD_PARTY_INCLUDES_END

DEFINE_LOG_CATEGORY(LogKBVEUnr);

FString FKBVEUnr::Version()
{
	return FString(ANSI_TO_TCHAR(unr_version()));
}

int32 FKBVEUnr::Add(int32 A, int32 B)
{
	return unr_add(A, B);
}

uint64 FKBVEUnr::RuntimeProbe(uint32 N)
{
	return unr_runtime_probe(N);
}

static void KBVEUnrProbe()
{
	const FString Version = FKBVEUnr::Version();
	const int32 Sum = FKBVEUnr::Add(2, 40);
	const uint64 Probe = FKBVEUnr::RuntimeProbe(10);

	UE_LOG(LogKBVEUnr, Display,
		TEXT("unr probe: version=%s add(2,40)=%d runtime_probe(10)=%llu"),
		*Version, Sum, Probe);

	// The values are fixed, so the command can say whether the link is healthy
	// rather than leaving a human to compare three numbers by eye.
	if (Sum == 42 && Probe == 45 && !Version.IsEmpty())
	{
		UE_LOG(LogKBVEUnr, Display, TEXT("unr probe: OK"));
	}
	else
	{
		UE_LOG(LogKBVEUnr, Error, TEXT("unr probe: FAILED"));
	}
}

static FAutoConsoleCommand GKBVEUnrProbeCmd(
	TEXT("unr.Probe"),
	TEXT("Call into the unr Rust staticlib and log version / add / runtime probe."),
	FConsoleCommandDelegate::CreateStatic(&KBVEUnrProbe));

IMPLEMENT_MODULE(FDefaultModuleImpl, KBVEUnr)
