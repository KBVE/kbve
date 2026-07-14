#include "KBVESupabaseTypes.h"

bool FKBVESupabaseJWTClaims::IsExpired(int64 LeewaySeconds) const
{
	if (ExpiresAt <= 0) return false;
	const int64 NowUnix = FDateTime::UtcNow().ToUnixTimestamp();
	return NowUnix >= (ExpiresAt - LeewaySeconds);
}
