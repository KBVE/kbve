#pragma once

#include "CoreMinimal.h"

/**
 * PKCE (RFC 7636) parameters for an OAuth flow.
 *
 * Verifier:   43-char URL-safe base64 of 32 random bytes.
 * Challenge:  URL-safe base64 of SHA-256(Verifier), method "S256".
 * State:      Random CSRF token bound to the loopback callback.
 */
struct KBVESUPABASE_API FKBVESupabasePKCE
{
	FString Verifier;
	FString Challenge;
	FString State;

	bool IsValid() const { return !Verifier.IsEmpty() && !Challenge.IsEmpty() && !State.IsEmpty(); }

	static FKBVESupabasePKCE Generate();
};

namespace KBVESupabaseCrypto
{
	KBVESUPABASE_API FString Base64URLEncode(TArrayView<const uint8> Bytes);
	KBVESUPABASE_API bool Base64URLDecode(const FString& Encoded, TArray<uint8>& OutBytes);
	KBVESUPABASE_API void Sha256(TArrayView<const uint8> Bytes, uint8 OutDigest[32]);
	KBVESUPABASE_API FString Sha256Base64URL(const FString& Input);
}
