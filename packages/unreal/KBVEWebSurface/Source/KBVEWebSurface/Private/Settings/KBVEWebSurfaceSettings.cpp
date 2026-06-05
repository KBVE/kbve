#include "Settings/KBVEWebSurfaceSettings.h"

bool UKBVEWebSurfaceSettings::IsURLAllowed(const FString& URL) const
{
	for (const FString& Blocked : BlockedURLPrefixes)
	{
		if (URL.StartsWith(Blocked))
		{
			return false;
		}
	}
	if (AllowedURLPrefixes.Num() == 0)
	{
		return true;
	}
	for (const FString& Allowed : AllowedURLPrefixes)
	{
		if (URL.StartsWith(Allowed))
		{
			return true;
		}
	}
	return false;
}
