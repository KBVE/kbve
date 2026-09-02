#pragma once

#include "CoreMinimal.h"

KBVEUNR_API DECLARE_LOG_CATEGORY_EXTERN(LogKBVEUnr, Log, All);

/**
 * Thin C++ face over the `unr` Rust staticlib. Keeps the C ABI out of gameplay
 * code: everything above this converts to Unreal types here and nowhere else.
 */
class KBVEUNR_API FKBVEUnr
{
public:
	/** Version string reported by the linked Rust library. */
	static FString Version();

	/** ABI round trip. Returns a + b as computed on the Rust side. */
	static int32 Add(int32 A, int32 B);

	/**
	 * Sums 0..N on the Rust tokio blocking pool, blocking until it finishes.
	 * Proves the runtime builds and runs inside the linked library.
	 */
	static uint64 RuntimeProbe(uint32 N);
};
