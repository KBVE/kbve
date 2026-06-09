#pragma once

#include "CoreMinimal.h"

#ifndef KBVEPERF_ENABLED
#define KBVEPERF_ENABLED 1
#endif

class UKBVEPerfSubsystem;

class KBVEPERF_API FKBVEPerf
{
public:
	static bool IsEnabled();
	static bool IsCategoryEnabled(FName Category);

	static void SubmitScope(FName Name, FName Category, double Ms);
	static void SubmitCount(FName Name, double Value);

	static void SetSubsystem(UKBVEPerfSubsystem* InSubsystem);
	static UKBVEPerfSubsystem* GetSubsystem();

	static void SetMasterEnabled(bool bEnabled);
	static void SetCategories(const TSet<FName>& InCategories, bool bAll);

private:
	static UKBVEPerfSubsystem* GSubsystem;
};

#if KBVEPERF_ENABLED

struct KBVEPERF_API FKBVEPerfScope
{
	FName Name;
	FName Category;
	double Start = 0.0;
	bool bActive = false;

	explicit FKBVEPerfScope(const TCHAR* InName);
	~FKBVEPerfScope();
};

#define KBVEPERF_JOIN2(a, b) a##b
#define KBVEPERF_JOIN(a, b) KBVEPERF_JOIN2(a, b)
#define KBVEPERF_SCOPE(NameLit) FKBVEPerfScope KBVEPERF_JOIN(_kbveperf_scope_, __LINE__)(TEXT(NameLit))
#define KBVEPERF_COUNT(NameLit, Value) FKBVEPerf::SubmitCount(FName(TEXT(NameLit)), static_cast<double>(Value))

#else

#define KBVEPERF_SCOPE(NameLit)
#define KBVEPERF_COUNT(NameLit, Value)

#endif
