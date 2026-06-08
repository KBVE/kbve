#include "KBVEPerf.h"
#include "KBVEPerfSubsystem.h"
#include "HAL/PlatformTime.h"

#include <atomic>

namespace
{
	std::atomic<int32> GMasterEnabled{ 0 };
	std::atomic<bool> GAllCategories{ true };
	FCriticalSection GCategoryLock;
	TSet<FName> GCategories;

	FName CategoryOf(const FName Name)
	{
		const FString S = Name.ToString();
		int32 Dot = INDEX_NONE;
		if (S.FindChar(TEXT('.'), Dot) && Dot > 0)
		{
			return FName(*S.Left(Dot));
		}
		return Name;
	}
}

UKBVEPerfSubsystem* FKBVEPerf::GSubsystem = nullptr;

bool FKBVEPerf::IsEnabled()
{
	return GMasterEnabled.load(std::memory_order_relaxed) != 0;
}

bool FKBVEPerf::IsCategoryEnabled(FName Category)
{
	if (GAllCategories.load(std::memory_order_relaxed))
	{
		return true;
	}
	FScopeLock Lock(&GCategoryLock);
	return GCategories.Contains(Category);
}

void FKBVEPerf::SubmitScope(FName Name, FName Category, double Ms)
{
	if (GSubsystem)
	{
		GSubsystem->SubmitScope(Name, Category, Ms);
	}
}

void FKBVEPerf::SubmitCount(FName Name, double Value)
{
	if (!IsEnabled())
	{
		return;
	}
	if (!IsCategoryEnabled(CategoryOf(Name)))
	{
		return;
	}
	if (GSubsystem)
	{
		GSubsystem->SubmitCount(Name, Value);
	}
}

void FKBVEPerf::SetSubsystem(UKBVEPerfSubsystem* InSubsystem)
{
	GSubsystem = InSubsystem;
}

UKBVEPerfSubsystem* FKBVEPerf::GetSubsystem()
{
	return GSubsystem;
}

void FKBVEPerf::SetMasterEnabled(bool bEnabled)
{
	GMasterEnabled.store(bEnabled ? 1 : 0, std::memory_order_relaxed);
}

void FKBVEPerf::SetCategories(const TSet<FName>& InCategories, bool bAll)
{
	{
		FScopeLock Lock(&GCategoryLock);
		GCategories = InCategories;
	}
	GAllCategories.store(bAll, std::memory_order_relaxed);
}

#if KBVEPERF_ENABLED

FKBVEPerfScope::FKBVEPerfScope(const TCHAR* InName)
{
	if (!FKBVEPerf::IsEnabled())
	{
		return;
	}
	Name = FName(InName);
	Category = CategoryOf(Name);
	if (!FKBVEPerf::IsCategoryEnabled(Category))
	{
		return;
	}
	bActive = true;
	Start = FPlatformTime::Seconds();
}

FKBVEPerfScope::~FKBVEPerfScope()
{
	if (!bActive)
	{
		return;
	}
	const double Ms = (FPlatformTime::Seconds() - Start) * 1000.0;
	FKBVEPerf::SubmitScope(Name, Category, Ms);
}

#endif
