#include "UEDevOpsSettings.h"

UUEDevOpsSettings::UUEDevOpsSettings()
{
	CategoryName = TEXT("Plugins");
}

const UUEDevOpsSettings* UUEDevOpsSettings::Get()
{
	return GetDefault<UUEDevOpsSettings>();
}

ELogVerbosity::Type UUEDevOpsSettings::ToEngineVerbosity(EDevOpsLogVerbosity V)
{
	switch (V)
	{
	case EDevOpsLogVerbosity::Fatal:   return ELogVerbosity::Fatal;
	case EDevOpsLogVerbosity::Error:   return ELogVerbosity::Error;
	case EDevOpsLogVerbosity::Warning: return ELogVerbosity::Warning;
	case EDevOpsLogVerbosity::Display: return ELogVerbosity::Display;
	case EDevOpsLogVerbosity::Log:     return ELogVerbosity::Log;
	default:                           return ELogVerbosity::Warning;
	}
}
