#pragma once

#include "CoreMinimal.h"
#include "KBVESupabaseTypes.h"

namespace KBVESupabaseJWT
{
	/**
	 * Decode the payload segment of a JWT into typed claims. Does NOT
	 * verify the signature — Supabase's backend is the authority on
	 * signature validity. The result is for client-side UX only.
	 */
	KBVESUPABASE_API bool Decode(const FString& Token, FKBVESupabaseJWTClaims& OutClaims);

	/** Convenience accessor for the access_token currently in memory. */
	KBVESUPABASE_API FDateTime ExpiresAtAsDateTime(const FKBVESupabaseJWTClaims& Claims);
}
