#include "UEDevOpsSettings.h"

UUEDevOpsSettings::UUEDevOpsSettings()
{
	CategoryName = TEXT("Plugins");
}

const UUEDevOpsSettings* UUEDevOpsSettings::Get()
{
	return GetDefault<UUEDevOpsSettings>();
}
